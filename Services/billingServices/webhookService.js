import { getStripe, getWebhookSecret } from './stripeClient.js';
import {
  syncSubscriptionFromStripe,
  handleInvoicePaymentFailed,
  handleInvoicePaymentSucceeded,
  findUserByStripeEvent,
} from './entitlementService.js';
import { notifyUser } from './notificationService.js';
import userModel from '../../Models/userSchema.js';
import {
  TRIAL_DAYS,
  getPlanIdByPriceId,
} from '../../Config/billingPlans.js';

/**
 * Stripe webhooks are the SOURCE OF TRUTH for subscription status.
 * Client redirects / success screens are never treated as authoritative.
 */
export const constructStripeEvent = (rawBody, signature) => {
  const stripe = getStripe();
  return stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
};

const notifyTrialStarted = async (user, stripeSub, io) => {
  const trialEnd = stripeSub.trial_end
    ? new Date(stripeSub.trial_end * 1000).toLocaleDateString('en-US')
    : null;

  await notifyUser({
    userId: user._id,
    io,
    title: 'Free trial started',
    message: trialEnd
      ? `Your ${TRIAL_DAYS}-day free trial is active until ${trialEnd}.`
      : `Your ${TRIAL_DAYS}-day free trial is active.`,
    emailSubject: 'Your PrepRX free trial has started',
    emailLines: [
      `Hi ${user.username},`,
      `Your ${TRIAL_DAYS}-day free trial has started.${trialEnd ? ` It ends on ${trialEnd}.` : ''}`,
      'You now have trial access to premium features. You will be charged when the trial converts to a paid subscription unless you cancel before then.',
    ],
  });
};

const notifyPaidActivated = async (user, io) => {
  await notifyUser({
    userId: user._id,
    io,
    title: 'Subscription active',
    message: 'Your payment was successful. Premium access is now active.',
    emailSubject: 'Your PrepRX subscription is active',
    emailLines: [
      `Hi ${user.username},`,
      'Your trial has converted to a paid subscription (or your payment succeeded). Premium access is active.',
      'You can manage your subscription anytime from Subscriptions in the sidebar.',
    ],
  });
};

const notifyUserCanceled = async (user, io, immediate) => {
  await notifyUser({
    userId: user._id,
    io,
    title: immediate ? 'Subscription canceled' : 'Cancellation scheduled',
    message: immediate
      ? 'Your subscription has been canceled immediately. Premium access has ended.'
      : 'Your subscription will cancel at the end of the current paid period. You keep access until then.',
    emailSubject: 'PrepRX subscription cancellation',
    emailLines: immediate
      ? [
          `Hi ${user.username},`,
          'Your subscription has been canceled immediately by an administrator. Premium access has ended. Your account remains active.',
        ]
      : [
          `Hi ${user.username},`,
          'Your subscription is set to cancel at the end of the current paid period. You will keep access until that date.',
        ],
  });
};

export const handleStripeWebhookEvent = async (event, io = null) => {
  const type = event.type;
  const object = event.data?.object;

  switch (type) {
    case 'checkout.session.completed': {
      // Subscription lifecycle continues via customer.subscription.* events.
      // Still sync customer id if present for faster linkage.
      const user = await findUserByStripeEvent(object) ||
        (object.metadata?.userId ? await userModel.findById(object.metadata.userId) : null);
      if (user && object.customer) {
        user.stripeCustomerId = typeof object.customer === 'string' ? object.customer : object.customer.id;
        await user.save();
      }
      if (user && object.subscription) {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(
          typeof object.subscription === 'string' ? object.subscription : object.subscription.id
        );
        const before = { status: user.subscription?.status, premium: user.subscription?.premium };
        await syncSubscriptionFromStripe(user, sub, { io, eventReason: type });
        if (sub.status === 'trialing' && before.status !== 'trialing') {
          await notifyTrialStarted(user, sub, io);
        }
      }
      break;
    }

    case 'customer.subscription.created': {
      // START TRIAL / activate trial entitlement
      const user = await findUserByStripeEvent(object) ||
        (object.metadata?.userId ? await userModel.findById(object.metadata.userId) : null);
      if (!user) break;

      const wasNone = !user.subscription?.status || user.subscription.status === 'none';
      await syncSubscriptionFromStripe(user, object, { io, eventReason: type });

      if (object.status === 'trialing') {
        await notifyTrialStarted(user, object, io);
      } else if (object.status === 'active' && wasNone) {
        await notifyPaidActivated(user, io);
      }
      break;
    }

    case 'customer.subscription.updated': {
      const user = await findUserByStripeEvent(object);
      if (!user) break;

      const prevStatus = user.subscription?.status;
      const prevCancel = user.subscription?.cancelAtPeriodEnd;
      const prevPlan = user.subscription?.planId;
      const newPlan = getPlanIdByPriceId(object.items?.data?.[0]?.price?.id);

      await syncSubscriptionFromStripe(user, object, { io, eventReason: type });

      if (object.status === 'trialing' && prevStatus !== 'trialing') {
        await notifyTrialStarted(user, object, io);
      }
      if (
        (object.status === 'active' && (prevStatus === 'trialing' || prevStatus === 'past_due' || prevStatus === 'suspended'))
      ) {
        // Trial→paid conversion or recovery reflected by subscription status
        if (prevStatus === 'trialing') {
          await notifyPaidActivated(user, io);
        }
      }
      if (object.cancel_at_period_end && !prevCancel) {
        await notifyUserCanceled(user, io, false);
      }
      if (newPlan && prevPlan && newPlan !== prevPlan) {
        await notifyUser({
          userId: user._id,
          io,
          title: 'Plan updated',
          message: `Your subscription plan was updated to ${newPlan}. Entitlement and renewal details are now synchronized.`,
          emailSubject: 'Your PrepRX plan was updated',
          emailLines: [
            `Hi ${user.username},`,
            'Your subscription plan has been changed. Proration (for upgrades) is handled by Stripe. Renewal details have been synchronized.',
          ],
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      // Final end: unpaid/canceled after dunning, or end of canceled period
      const user = await findUserByStripeEvent(object);
      if (!user) break;

      const hadPaymentFailure = Boolean(user.subscription?.graceEndsAt);
      await syncSubscriptionFromStripe(user, { ...object, status: object.status || 'canceled' }, {
        io,
        eventReason: hadPaymentFailure ? 'payment_failed' : type,
      });

      if (user.subscription?.status === 'suspended') {
        // suspension email already sent by sync when transitioning to suspended
      } else if (user.subscription?.status === 'canceled') {
        await notifyUserCanceled(user, io, true);
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Notify + start 7-day grace. Do NOT suspend. Access remains active.
      const user = await findUserByStripeEvent(object);
      if (!user) break;
      await handleInvoicePaymentFailed(user, object, { io });
      break;
    }

    case 'invoice.payment_succeeded':
    case 'invoice.paid': {
      // Keep active + update paid-through; recovery if was in grace/past_due
      const user = await findUserByStripeEvent(object);
      if (!user) break;

      // Also re-sync full subscription if linked
      await handleInvoicePaymentSucceeded(user, object, { io });

      const subId = typeof object.subscription === 'string'
        ? object.subscription
        : object.subscription?.id;
      if (subId) {
        const stripe = getStripe();
        try {
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(user, sub, { io, eventReason: type });
        } catch (err) {
          console.error('Post-payment subscription sync failed:', err.message);
        }
      }
      break;
    }

    default:
      // Ignore unhandled event types — do not invent extra rules
      break;
  }
};
