import userModel from '../../Models/userSchema.js';
import { getStripe } from './stripeClient.js';
import {
  PLANS,
  getPlan,
  getPlanIdByPriceId,
  getPlanPriceId,
  getFrontendUrl,
  TRIAL_DAYS,
} from '../../Config/billingPlans.js';

// Stripe subscription states that mean the user already holds (or owes) a
// subscription. Checking these against Stripe — not the local cache — is what
// closes the double-subscription window between Checkout completing and the
// `customer.subscription.created` webhook landing.
const LIVE_STRIPE_STATUSES = ['trialing', 'active', 'past_due', 'unpaid', 'paused'];

const ensureStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const userId = user._id.toString();

  // Idempotency key derived from the user id: two concurrent checkout requests
  // (double click, two tabs) resolve to ONE Stripe customer instead of creating
  // an orphaned duplicate that Stripe's aggregates would silently exclude.
  const customer = await stripe.customers.create(
    {
      email: user.email,
      name: user.username,
      metadata: { userId },
    },
    { idempotencyKey: `preprx-customer-${userId}` }
  );

  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
};

/**
 * A trial is granted once per account — the first subscription Stripe ever
 * creates for this user. Any prior subscription (even a canceled one) means the
 * user already consumed it.
 */
const isTrialEligible = (userDoc) => {
  const sub = userDoc.subscription;
  if (!sub) return true;
  if (sub.trialUsedAt) return false;
  if (sub.stripeSubscriptionId) return false;
  return !['trialing', 'active', 'past_due', 'suspended', 'canceled'].includes(sub.status);
};

export const createCheckoutSessionService = async (userDoc, planId) => {
  const stripe = getStripe();
  const plan = getPlan(planId);
  const priceId = getPlanPriceId(planId);
  const customerId = await ensureStripeCustomer(userDoc);
  const frontend = getFrontendUrl();

  // Authoritative check against Stripe. Relying on the local subscription cache
  // lets a user start a second subscription while the first webhook is in flight.
  const existingSubs = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 100,
  });
  const liveSub = existingSubs.data.find((s) => LIVE_STRIPE_STATUSES.includes(s.status));

  if (liveSub) {
    // Already subscribed (or owes payment) — send them to the portal instead of
    // creating a duplicate subscription.
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontend}/subscriptions/manage`,
    });
    return { url: portal.url, alreadySubscribed: true };
  }

  const trialEligible = isTrialEligible(userDoc);

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      // Only the very first subscription carries a trial.
      ...(trialEligible ? { trial_period_days: TRIAL_DAYS } : {}),
      metadata: { userId: userDoc._id.toString(), planId },
    },
    metadata: { userId: userDoc._id.toString(), planId },
    client_reference_id: userDoc._id.toString(),
    allow_promotion_codes: false,
    success_url: `${frontend}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontend}/pricing`,
  });

  return { url: session.url, sessionId: session.id, planId: plan.id, trialEligible };
};

export const createPortalSessionService = async (userDoc) => {
  const stripe = getStripe();
  const customerId = await ensureStripeCustomer(userDoc);
  const frontend = getFrontendUrl();

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${frontend}/subscriptions/manage`,
  });

  return { url: session.url };
};

/**
 * User cancel → cancel at period end (access continues until end of paid period).
 * Admin immediate cancel is a separate service (adminCancelSubscriptionService).
 * `reason` is the churn reason collected by the UI and is persisted so it is
 * never lost (see CancelSubscription page).
 */
export const cancelSubscriptionAtPeriodEndService = async (userDoc, reason = null) => {
  const stripe = getStripe();
  const subId = userDoc.subscription?.stripeSubscriptionId;
  if (!subId) {
    throw new Error('No active subscription to cancel');
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  if (sub.status === 'canceled') {
    throw new Error('Subscription is already canceled');
  }

  if (!sub.cancel_at_period_end) {
    await stripe.subscriptions.update(subId, {
      cancel_at_period_end: true,
      metadata: {
        ...(sub.metadata || {}),
        canceledBy: 'user',
      },
    });
  }

  // Local optimistic flag — entitlement remains webhook-driven for premium/status.
  // canceledBy/cancelReason are recorded here so the later
  // `customer.subscription.deleted` webhook can send accurate copy.
  userDoc.subscription.cancelAtPeriodEnd = true;
  userDoc.subscription.canceledBy = 'user';
  userDoc.subscription.cancelReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
  userDoc.subscription.cancelRequestedAt = new Date();
  await userDoc.save();

  return {
    cancelAtPeriodEnd: true,
    message: 'Subscription will cancel at the end of the current paid period. Access continues until then.',
  };
};

/**
 * PLAN CHANGE — upgrades bill immediately via Stripe proration.
 * Downgrades use proration_behavior: 'none' with an unchanged billing anchor so
 * the lower price starts at the NEXT renewal. Using 'create_prorations' for a
 * downgrade would refund the unused remainder to the card immediately.
 */
export const changePlanService = async (userDoc, planId) => {
  const stripe = getStripe();
  const priceId = getPlanPriceId(planId);
  const plan = getPlan(planId);
  const subId = userDoc.subscription?.stripeSubscriptionId;

  if (!subId) {
    const checkout = await createCheckoutSessionService(userDoc, planId);
    return { ...checkout, requiresCheckout: true };
  }

  const sub = await stripe.subscriptions.retrieve(subId);
  if (sub.status === 'canceled') {
    const checkout = await createCheckoutSessionService(userDoc, planId);
    return { ...checkout, requiresCheckout: true };
  }

  const item = sub.items.data[0];
  if (item.price.id === priceId) {
    return { message: 'Already on this plan', planId: plan.id, unchanged: true };
  }

  // Direction of change is decided from the catalog, never from client input.
  const currentPlanId = getPlanIdByPriceId(item.price.id);
  const currentAmount = currentPlanId ? PLANS[currentPlanId]?.amount : null;
  const isDowngrade = currentAmount != null && plan.amount < currentAmount;

  const update = {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: isDowngrade ? 'none' : 'create_prorations',
    metadata: {
      ...(sub.metadata || {}),
      planId: plan.id,
      userId: userDoc._id.toString(),
    },
  };

  // Downgrades must not re-anchor the billing cycle, otherwise the customer is
  // charged the new (lower) amount starting today.
  if (isDowngrade) {
    update.billing_cycle_anchor = 'unchanged';
  }

  await stripe.subscriptions.update(subId, update);

  // Fetch updated subscription and sync — webhook will also fire as source of truth
  const updated = await stripe.subscriptions.retrieve(subId);
  userDoc.subscription.priceId = priceId;
  userDoc.subscription.planId = plan.id;
  await userDoc.save();

  return {
    planId: plan.id,
    isDowngrade,
    stripeStatus: updated.status,
    message: isDowngrade
      ? `Plan change to ${plan.title} scheduled. The new price starts at your next renewal on ${updated.current_period_end ? new Date(updated.current_period_end * 1000).toLocaleDateString('en-US') : 'the next billing date'} — no charge or refund today.`
      : 'Plan change submitted. Entitlement and renewal details will synchronize via Stripe webhooks.',
  };
};

export const getSubscriptionService = async (userDoc) => {
  const sub = userDoc.subscription || {};
  return {
    status: sub.status || 'none',
    premium: Boolean(sub.premium),
    planId: sub.planId || null,
    priceId: sub.priceId || null,
    trialEndsAt: sub.trialEndsAt || null,
    trialUsedAt: sub.trialUsedAt || null,
    paidThrough: sub.paidThrough || null,
    currentPeriodEnd: sub.currentPeriodEnd || null,
    graceEndsAt: sub.graceEndsAt || null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    canceledBy: sub.canceledBy || null,
    cancelReason: sub.cancelReason || null,
    cancelRequestedAt: sub.cancelRequestedAt || null,
    stripeSubscriptionId: sub.stripeSubscriptionId || null,
    hasCustomer: Boolean(userDoc.stripeCustomerId),
    // Derived from the catalog so prices can never drift from Config/billingPlans.js.
    plans: Object.fromEntries(
      Object.values(PLANS).map((p) => [
        p.id,
        { title: p.title, amount: p.amount, currency: p.currency },
      ])
    ),
  };
};

/**
 * Admin exception: immediate cancellation in Stripe.
 */
export const adminCancelSubscriptionService = async (targetUserId) => {
  const user = await userModel.findById(targetUserId);
  if (!user) {
    throw new Error('User not found');
  }

  const subId = user.subscription?.stripeSubscriptionId;
  if (!subId || user.subscription?.status === 'canceled' || user.subscription?.status === 'none') {
    // Nothing to cancel in Stripe — clear local entitlement only if present
    if (user.subscription?.stripeSubscriptionId) {
      user.subscription.status = 'canceled';
      user.subscription.premium = false;
      user.subscription.cancelAtPeriodEnd = false;
      user.subscription.canceledBy = 'admin';
      user.subscription.canceledAt = new Date();
      await user.save();
    }
    return { user, hadStripeSubscription: false };
  }

  const stripe = getStripe();

  // Mark the initiator BEFORE calling Stripe. The resulting
  // `customer.subscription.deleted` webhook reads this to send the correct copy.
  // Notifying here as well would double-notify the user (and double-email).
  user.subscription.canceledBy = 'admin';
  await user.save();

  await stripe.subscriptions.cancel(subId, {
    invoice_now: false,
    prorate: false,
  });

  // Optimistic local update — webhook will confirm as source of truth
  user.subscription.status = 'canceled';
  user.subscription.premium = false;
  user.subscription.cancelAtPeriodEnd = false;
  user.subscription.canceledAt = new Date();
  await user.save();

  // Notification is deliberately NOT sent here: the authoritative
  // `customer.subscription.deleted` webhook fires from stripe.subscriptions.cancel()
  // above and sends exactly one in-app notification + email via notifyUserCanceled().

  return { user, hadStripeSubscription: true };
};
