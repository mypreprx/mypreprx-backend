import userModel from '../../Models/userSchema.js';

/**
 * Server-side paywall.
 *
 * `subscription.premium` is written exclusively by the Stripe webhook
 * (entitlementService.syncSubscriptionFromStripe), so this reads the
 * entitlement Stripe last confirmed — the client is never trusted.
 *
 * Runs AFTER VerifyUser + allowRoles('user'), so req.user.id is a real user id.
 * Returns 402 so the client can send the user to the paywall.
 */
export const RequirePremium = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id).select('subscription');

    if (!user?.subscription?.premium) {
      return res.status(402).json({
        success: false,
        code: 'SUBSCRIPTION_REQUIRED',
        message: 'An active PrepRX subscription is required to access this feature.'
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
};
