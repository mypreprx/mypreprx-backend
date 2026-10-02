import userModel from '../../Models/userSchema.js';
import { hasActiveEntitlement, revokeExpiredPromoIfNeeded } from '../../Services/billingServices/promoRedemptionService.js';

/**
 * Server-side paywall.
 *
 * `subscription.premium` is written by the Stripe webhook
 * (entitlementService.syncSubscriptionFromStripe) or by a single-use promo
 * redemption, so this reads the entitlement the server last confirmed — the
 * client is never trusted.
 *
 * Runs AFTER VerifyUser + allowRoles('user'), so req.user.id is a real user id.
 * Returns 402 so the client can send the user to the paywall.
 */
export const RequirePremium = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user.id).select('subscription');

    // An expired promo must not keep serving premium content, so the expiry is
    // enforced here — the enforcement point that actually guards the data.
    await revokeExpiredPromoIfNeeded(user);

    if (!hasActiveEntitlement(user)) {
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