import express from 'express';
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
