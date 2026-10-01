import userModel from '../Models/userSchema.js';
import {
  createCheckoutSessionService,
  createPortalSessionService,
  cancelSubscriptionAtPeriodEndService,
  changePlanService,
  getSubscriptionService,
  adminCancelSubscriptionService,
} from '../Services/billingServices/billingService.js';
import { constructStripeEvent, handleStripeWebhookEvent } from '../Services/billingServices/webhookService.js';
import {
  listNotificationsService,
  markNotificationsReadService,
} from '../Services/billingServices/notificationService.js';

const loadUser = async (userId) => {
  const user = await userModel.findById(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  return user;
};

// ==========================================
// STRIPE WEBHOOK — source of truth (raw body)
// ==========================================
export const stripeWebhookHandler = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ success: false, message: 'Missing stripe-signature header' });
  }

  let event;
  try {
    event = constructStripeEvent(req.body, signature);
  } catch (err) {
    console.error('[stripe-webhook] SIGNATURE VERIFICATION FAILED:', err.message);
    return res.status(400).json({ success: false, message: `Webhook Error: ${err.message}` });
  }

  // Visible in `pm2 logs backend`. If this line never appears, the request is
  // not reaching Node at all (nginx / routing) rather than a code fault.
  console.log(`[stripe-webhook] RECEIVED ${event.type} id=${event.id}`);

  try {
    const io = req.app.get('io');
    await handleStripeWebhookEvent(event, io);
    // Always acknowledge accepted events so Stripe does not retry verification errors
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handling error:', err);
    // Return 200 after logging for non-signature handler crashes? Stripe retries on 5xx.
    // Return 500 so Stripe retries — state will converge when handler succeeds.
    return res.status(500).json({ success: false, message: `Webhook handler failed: ${err.message}` });
  }
};

// ==========================================
// USER BILLING ENDPOINTS
// ==========================================
export const startCheckout = async (req, res) => {
  try {
    const user = await loadUser(req.user.id);
    const { planId } = req.body || {};
    if (!planId) {
      return res.status(400).json({ success: false, message: 'planId is required' });
    }
    const result = await createCheckoutSessionService(user, planId);
    // The guard returns a billing-portal URL instead of a checkout session when a
    // live subscription already exists. Stay on 200 because the client follows
    // data.url either way, but report accurately instead of claiming a checkout
    // session was created.
    if (result.alreadySubscribed) {
      return res.status(200).json({
        success: true,
        message: 'You already have an active subscription. Opening the billing portal.',
        data: result,
      });
    }
    return res.status(200).json({ success: true, message: 'Checkout session created', data: result });
  } catch (error) {
    const status = error.message?.includes('Invalid plan') || error.message?.includes('Missing Stripe')
      ? 400
      : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const openBillingPortal = async (req, res) => {
  try {
    const user = await loadUser(req.user.id);
    const result = await createPortalSessionService(user);
    return res.status(200).json({ success: true, message: 'Portal session created', data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const cancelOwnSubscription = async (req, res) => {
  try {
    const user = await loadUser(req.user.id);
    // Churn reason collected by the cancel form. Optional, length-capped.
    const { reason } = req.body || {};
    if (reason != null && typeof reason !== 'string') {
      return res.status(400).json({ success: false, message: 'reason must be a string' });
    }
    if (typeof reason === 'string' && reason.length > 500) {
      return res.status(400).json({ success: false, message: 'reason must be 500 characters or fewer' });
    }
    const result = await cancelSubscriptionAtPeriodEndService(user, reason);
    return res.status(200).json({ success: true, message: result.message, data: result });
  } catch (error) {
    const status = error.message?.includes('No active subscription') ? 400 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const changeOwnPlan = async (req, res) => {
  try {
    const user = await loadUser(req.user.id);
    const { planId } = req.body || {};
    if (!planId) {
      return res.status(400).json({ success: false, message: 'planId is required' });
    }
    const result = await changePlanService(user, planId);
    return res.status(200).json({ success: true, message: result.message || 'Plan updated', data: result });
  } catch (error) {
    const status = error.message?.includes('Invalid plan') || error.message?.includes('Missing Stripe')
      ? 400
      : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};

export const getOwnSubscription = async (req, res) => {
  try {
    const user = await loadUser(req.user.id);
    const data = await getSubscriptionService(user);
    return res.status(200).json({ success: true, message: 'Subscription fetched', data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

// ==========================================
// IN-APP NOTIFICATIONS
// ==========================================
export const getNotifications = async (req, res) => {
  try {
    const data = await listNotificationsService(req.user.id);
    return res.status(200).json({ success: true, message: 'Notifications fetched', data });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    await markNotificationsReadService(req.user.id);
    return res.status(200).json({ success: true, message: 'Notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// ADMIN — immediate cancel (explicit exception)
// ==========================================
export const adminCancelUserSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const io = req.app.get('io');
    const result = await adminCancelSubscriptionService(userId, { io });
    return res.status(200).json({
      success: true,
      message: result.hadStripeSubscription
        ? 'Subscription canceled immediately'
        : 'No active Stripe subscription to cancel',
      data: { userId, status: result.user.subscription?.status },
    });
  } catch (error) {
    const status = error.message === 'User not found' ? 404 : 500;
    return res.status(status).json({ success: false, message: error.message });
  }
};
