import express from 'express';
import { createHash } from 'crypto';
import { VerifyUser, allowRoles } from '../Middleware/auth/authentication.js';
import {
  startCheckout,
  openBillingPortal,
  cancelOwnSubscription,
  changeOwnPlan,
  getOwnSubscription,
  getNotifications,
  markNotificationsRead,
  adminCancelUserSubscription,
} from '../Controllers/billingController.js';

const billingRoutes = express.Router();

// TEMP diagnostic — proves the running server sees the same webhook secret
// as Stripe. Exposes no secret material, only a hash prefix. Remove after use.
billingRoutes.get('/billing/webhook-diag', (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  return res.json({
    ok: true,
    secretConfigured: Boolean(secret),
    secretLength: secret.length,
    secretFingerprint: secret
      ? createHash('sha256').update(secret).digest('hex').slice(0, 12)
      : null,
    serverTime: new Date().toISOString(),
  });
});

// User billing
billingRoutes.get('/billing/subscription', VerifyUser, allowRoles('user'), getOwnSubscription);
billingRoutes.post('/billing/checkout', VerifyUser, allowRoles('user'), startCheckout);
billingRoutes.post('/billing/portal', VerifyUser, allowRoles('user'), openBillingPortal);
billingRoutes.post('/billing/cancel', VerifyUser, allowRoles('user'), cancelOwnSubscription);
billingRoutes.post('/billing/plan', VerifyUser, allowRoles('user'), changeOwnPlan);

// In-app notifications
billingRoutes.get('/billing/notifications', VerifyUser, allowRoles('user'), getNotifications);
billingRoutes.post('/billing/notifications/read', VerifyUser, allowRoles('user'), markNotificationsRead);

// Admin — immediate cancellation exception
billingRoutes.post(
  '/admin/subscriptions/:userId/cancel-immediate',
  VerifyUser,
  allowRoles('admin'),
  adminCancelUserSubscription
);

export default billingRoutes;
