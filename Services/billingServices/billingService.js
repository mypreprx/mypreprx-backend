import userModel from '../../Models/userSchema.js';
import { getStripe } from './stripeClient.js';
import {
  getPlan,
  getPlanPriceId,
  getFrontendUrl,
  TRIAL_DAYS,
} from '../../Config/billingPlans.js';

const ensureStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.username,
    metadata: { userId: user._id.toString() },
  });

  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
};

export const createCheckoutSessionService = async (userDoc, planId) => {
  const stripe = getStripe();
  const plan = getPlan(planId);
  const priceId = getPlanPriceId(planId);
  const customerId = await ensureStripeCustomer(userDoc);
  const frontend = getFrontendUrl();

  // If user already has an active/trialing/past_due subscription, send them to portal instead
  const existing = userDoc.subscription;
  if (
    existing?.stripeSubscriptionId &&
    ['trialing', 'active', 'past_due'].includes(existing.status)
  ) {
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${frontend}/subscriptions/manage`,
    });
    return { url: portal.url, alreadySubscribed: true };
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: { userId: userDoc._id.toString(), planId },
    },
    metadata: { userId: userDoc._id.toString(), planId },
    client_reference_id: userDoc._id.toString(),
    allow_promotion_codes: false,
    success_url: `${frontend}/confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${frontend}/pricing`,
  });

  return { url: session.url, sessionId: session.id, planId: plan.id };
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
 */
export const cancelSubscriptionAtPeriodEndService = async (userDoc) => {
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

  // Local optimistic flag — entitlement remains webhook-driven for premium/status
  userDoc.subscription.cancelAtPeriodEnd = true;
  await userDoc.save();

  return {
    cancelAtPeriodEnd: true,
    message: 'Subscription will cancel at the end of the current paid period. Access continues until then.',
  };
};

/**
 * PLAN CHANGE — Stripe handles proration for upgrades. No custom proration math.
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

  // Proration (including upgrades) is handled entirely by Stripe
  await stripe.subscriptions.update(subId, {
    items: [{ id: item.id, price: priceId }],
    proration_behavior: 'create_prorations',
    metadata: {
      ...(sub.metadata || {}),
      planId: plan.id,
      userId: userDoc._id.toString(),
    },
  });

  // Fetch updated subscription and sync — webhook will also fire as source of truth
  const updated = await stripe.subscriptions.retrieve(subId);
  userDoc.subscription.priceId = priceId;
  userDoc.subscription.planId = plan.id;
  await userDoc.save();

  return {
    planId: plan.id,
    stripeStatus: updated.status,
    message: 'Plan change submitted. Entitlement and renewal details will synchronize via Stripe webhooks.',
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
    paidThrough: sub.paidThrough || null,
    currentPeriodEnd: sub.currentPeriodEnd || null,
    graceEndsAt: sub.graceEndsAt || null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    stripeSubscriptionId: sub.stripeSubscriptionId || null,
    hasCustomer: Boolean(userDoc.stripeCustomerId),
    plans: Object.fromEntries(
      Object.entries(
        // return catalog without secrets
        {
          monthly: { title: 'Monthly', amount: 2999, currency: 'usd' },
          'three-month': { title: '3-Month', amount: 7999, currency: 'usd' },
          annual: { title: 'Annual', amount: 25900, currency: 'usd' },
        }
      ).map(([id, p]) => [id, p])
    ),
  };
};

/**
 * Admin exception: immediate cancellation in Stripe.
 */
export const adminCancelSubscriptionService = async (targetUserId, { io = null } = {}) => {
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
      await user.save();
    }
    return { user, hadStripeSubscription: false };
  }

  const stripe = getStripe();
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

  const { notifyUser } = await import('./notificationService.js');
  await notifyUser({
    userId: user._id,
    io,
    title: 'Subscription canceled',
    message: 'An administrator canceled your subscription immediately. Premium access has ended. Your account remains active.',
    emailSubject: 'Your PrepRX subscription was canceled',
    emailLines: [
      `Hi ${user.username},`,
      'Your subscription was canceled immediately by an administrator. Premium access has ended. Your account has not been deleted.',
    ],
  });

  return { user, hadStripeSubscription: true };
};
