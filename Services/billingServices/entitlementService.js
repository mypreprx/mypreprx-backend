import userModel from '../../Models/userSchema.js';
import { getPlanIdByPriceId, GRACE_PERIOD_DAYS } from '../../Config/billingPlans.js';
import { notifyUser } from './notificationService.js';

/**
 * Derive PrepRX entitlement + status from a Stripe subscription object.
 * Rules:
 * - trial / active → premium
 * - past_due → premium remains (7-day grace — do not suspend on first failure)
 * - unpaid / canceled (non-recovered or ended) → suspend premium
 * - Never delete the user account
 */
const mapStripeStatus = (stripeStatus, { hadPaymentFailure = false, cancelAtPeriodEnd = false } = {}) => {
  switch (stripeStatus) {
    case 'trialing':
      return { status: 'trialing', premium: true };
    case 'active':
      return { status: 'active', premium: true };
    case 'past_due':
      return { status: 'past_due', premium: true };
    case 'unpaid':
      return { status: 'suspended', premium: false };
    case 'canceled':
      // Payment not recovered (dunning ended) → suspended.
      // Normal end after user cancel-at-period-end → canceled (access already ran to period end).
      if (hadPaymentFailure) {
        return { status: 'suspended', premium: false };
      }
      if (cancelAtPeriodEnd) {
        return { status: 'canceled', premium: false };
      }
      return { status: 'canceled', premium: false };
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
    default:
      return { status: 'none', premium: false };
  }
};

export const syncSubscriptionFromStripe = async (user, stripeSubscription, { io = null, eventReason = null } = {}) => {
  if (!user || !stripeSubscription) return user;

  const sub = stripeSubscription;
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const planId = getPlanIdByPriceId(priceId) || user.subscription?.planId || null;

  const hadPaymentFailure = Boolean(user.subscription?.graceEndsAt) || eventReason === 'payment_failed';
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
  const mapped = mapStripeStatus(sub.status, { hadPaymentFailure, cancelAtPeriodEnd });

  const currentPeriodEnd = sub.items?.data?.[0]?.current_period_end
    ? new Date(sub.items.data[0].current_period_end * 1000)
    : sub.current_period_end
      ? new Date(sub.current_period_end * 1000)
      : null;

  const trialEndsAt = sub.trial_end ? new Date(sub.trial_end * 1000) : null;

  const previousStatus = user.subscription?.status;

  // Clear grace when Stripe confirms a healthy paid state again
  const clearGrace = sub.status === 'active' || sub.status === 'trialing';

  user.stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id || user.stripeCustomerId);
  user.subscription = {
    ...(user.subscription?.toObject?.() || user.subscription || {}),
    stripeSubscriptionId: sub.id,
    status: mapped.status,
    planId,
    priceId,
    premium: mapped.premium,
    trialEndsAt: trialEndsAt || user.subscription?.trialEndsAt || null,
    paidThrough: clearGrace
      ? (currentPeriodEnd || user.subscription?.paidThrough || null)
      : (user.subscription?.paidThrough || null),
    currentPeriodEnd: currentPeriodEnd || user.subscription?.currentPeriodEnd || null,
    graceEndsAt: clearGrace ? null : (user.subscription?.graceEndsAt || null),
    cancelAtPeriodEnd,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : (user.subscription?.canceledAt || null),
  };

  // Suspension notification — only when moving into suspended (webhook-confirmed)
  if (mapped.status === 'suspended' && previousStatus !== 'suspended') {
    const alreadyNotified = user.subscription.suspendNotifiedAt;
    if (!alreadyNotified) {
      user.subscription.suspendNotifiedAt = new Date();
      await user.save();
      await notifyUser({
        userId: user._id,
        io,
        title: 'Subscription suspended',
        message: 'Your premium access has been suspended because payment was not recovered. Your account is still active.',
        emailSubject: 'Your PrepRX subscription has been suspended',
        emailLines: [
          `Hi ${user.username},`,
          'We were unable to recover payment for your subscription, so premium access has been suspended.',
          'Your account has not been deleted. You can update your payment method or resubscribe to regain access.',
        ],
      });
      return user;
    }
  }

  if (mapped.status !== 'suspended') {
    user.subscription.suspendNotifiedAt = null;
  }

  await user.save();
  return user;
};

export const handleInvoicePaymentFailed = async (user, invoice, { io = null } = {}) => {
  if (!user) return null;

  const now = new Date();
  const graceEndsAt = new Date(now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const wasInGrace = Boolean(user.subscription?.graceEndsAt);

  user.subscription = {
    ...(user.subscription?.toObject?.() || user.subscription || {}),
    // Access remains active during grace — do not suspend
    premium: true,
    status: 'past_due',
    graceEndsAt,
  };
  await user.save();

  const graceEndsLabel = graceEndsAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  await notifyUser({
    userId: user._id,
    io,
    title: wasInGrace ? 'Payment reminder' : 'Payment failed',
    message: wasInGrace
      ? `We still couldn't process your payment. Your ${GRACE_PERIOD_DAYS}-day grace period ends ${graceEndsLabel}. Access remains active.`
      : `Your latest payment failed. You have a ${GRACE_PERIOD_DAYS}-day grace period (ends ${graceEndsLabel}). Access remains active.`,
    emailSubject: wasInGrace
      ? 'Payment reminder — PrepRX subscription'
      : 'Payment failed — PrepRX subscription',
    emailLines: [
      `Hi ${user.username},`,
      wasInGrace
        ? `We were unable to process your subscription payment again. Your ${GRACE_PERIOD_DAYS}-day grace period ends on ${graceEndsLabel}.`
        : `We were unable to process your subscription payment. A ${GRACE_PERIOD_DAYS}-day grace period has started and ends on ${graceEndsLabel}.`,
      'During the grace period your access remains active. Please update your payment method to avoid interruption.',
    ],
  });

  return user;
};

export const handleInvoicePaymentSucceeded = async (user, invoice, { io = null } = {}) => {
  if (!user) return null;

  const subscriptionId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id;

  const hadGrace = Boolean(user.subscription?.graceEndsAt);
  const wasPastDue = user.subscription?.status === 'past_due' || user.subscription?.status === 'suspended';

  let paidThrough = user.subscription?.paidThrough || null;
  const periodEnd = invoice.lines?.data?.[0]?.period?.end
    ? new Date(invoice.lines.data[0].period.end * 1000)
    : invoice.period_end
      ? new Date(invoice.period_end * 1000)
      : null;
  if (periodEnd) paidThrough = periodEnd;

  user.subscription = {
    ...(user.subscription?.toObject?.() || user.subscription || {}),
    stripeSubscriptionId: subscriptionId || user.subscription?.stripeSubscriptionId || null,
    status: 'active',
    premium: true,
    paidThrough,
    graceEndsAt: null,
    suspendNotifiedAt: null,
  };
  await user.save();

  if (hadGrace || wasPastDue) {
    await notifyUser({
      userId: user._id,
      io,
      title: 'Payment recovered',
      message: 'Your payment was successful. Your subscription is active again and billing has resumed normally.',
      emailSubject: 'Payment recovered — PrepRX subscription',
      emailLines: [
        `Hi ${user.username},`,
        'Your payment has been recovered successfully. Your subscription is active again and normal billing has resumed.',
      ],
    });
  }

  return user;
};

export const findUserByStripeEvent = async (obj) => {
  if (!obj) return null;

  // Prefer client_reference_id / metadata.userId from checkout
  if (obj.metadata?.userId) {
    const byMeta = await userModel.findById(obj.metadata.userId);
    if (byMeta) return byMeta;
  }

  const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : obj.id?.startsWith?.('sub_') ? obj.id : null;
  if (subscriptionId) {
    const bySub = await userModel.findOne({ 'subscription.stripeSubscriptionId': subscriptionId });
    if (bySub) return bySub;
  }

  const customerId = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id;
  if (customerId) {
    const byCustomer = await userModel.findOne({ stripeCustomerId: customerId });
    if (byCustomer) return byCustomer;
  }

  if (obj.client_reference_id) {
    const byRef = await userModel.findById(obj.client_reference_id);
    if (byRef) return byRef;
  }

  return null;
};
