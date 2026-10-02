import userModel from '../../Models/userSchema.js';
import PromoCode from '../../Models/promoCodeSchema.js';
import { notifyUser } from './notificationService.js';
import { normalizeCode } from '../adminServices/PromoCodeServices/PromoCodeService.js';

/**
 * Promo code redemption — single use, 6 months of free premium access.
 *
 * SECURITY MODEL
 * --------------
 * 1. SINGLE USE, ATOMIC. A code is claimed with one conditional
 *    `findOneAndUpdate({ redeemedBy: null })`. MongoDB applies that as a single
 *    atomic document update, so if 5 requests race on the same code exactly ONE
 *    matches and the other four are rejected. A read-then-write
 *    ("find the code, check it is unused, then mark it used") would let several
 *    requests all observe `redeemedBy: null` and grant 6 months each.
 *
 * 2. NEVER BURN A CODE WE COULD NOT HONOR. If claiming succeeds but granting
 *    fails, the claim is released (best effort) so the code is still usable.
 *
 * 3. NO ENUMERATION. Unknown code, deactivated code and already-redeemed code
 *    all return the identical message, so the endpoint cannot be used to probe
 *    which codes exist.
 *
 * 4. SERVER-SIDE ONLY. The account that benefits is always the one in the JWT,
 *    never anything in the request body.
 *
 * 5. IDEMPOTENT FOR THE SAME USER. Re-posting the same code after a successful
 *    redemption returns that user's own grant instead of an error, so a double
 *    click or a retried request is harmless.
 */
export const PROMO_SUBSCRIPTION_MONTHS = 6;

// Deliberately vague: identical for "unknown", "inactive" and "already used".
const INVALID_CODE_MESSAGE =
  'This promo code is invalid, no longer active, or has already been used.';

const httpError = (message, status, code) => {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
};

/** Codes are secrets. Never write a full one to the logs. */
export const maskCode = (code) => {
  const value = String(code || '');
  if (value.length <= 4) return '***';
  return `${value.slice(0, 2)}${'*'.repeat(Math.max(value.length - 4, 1))}${value.slice(-2)}`;
};

/**
 * Calendar months, not 180 days, clamped to the last valid day of the target
 * month so "6 months" from Aug 31 lands on Feb 28/29 instead of rolling into
 * March. All arithmetic is UTC to stay clear of DST and server timezone.
 */
export const addCalendarMonths = (from, months) => {
  const result = new Date(from.getTime());
  const dayOfMonth = result.getUTCDate();

  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);

  const lastDayOfTargetMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();

  result.setUTCDate(Math.min(dayOfMonth, lastDayOfTargetMonth));
  return result;
};

/**
 * The one place that answers "does this account have premium right now".
 *
 * A promo is only valid while `promoEndsAt` is in the future. The
 * `status === 'promo'` guard is essential: once a user buys a real plan the
 * webhook sets status to 'active'/'trialing' and the promo's end date is still
 * in the past. Without the guard, expiry logic would revoke their PAID plan.
 */
export const hasActiveEntitlement = (user) => {
  const sub = user?.subscription;
  if (!sub?.premium) return false;

  if (sub.status === 'promo') {
    if (!sub.promoEndsAt) return false;
    return sub.promoEndsAt.getTime() > Date.now();
  }

  return true;
};

/** True while the account still holds any subscription (paid, trialing, in grace, or promo). */
export const hasAnySubscription = (user) => {
  const status = user?.subscription?.status;
  return ['trialing', 'active', 'past_due', 'unpaid', 'suspended', 'promo'].includes(status);
};

/**
 * Lazily revoke a lapsed promo. Called on the requests that matter
 * (/user/Home and the premium paywall) instead of on a timer, so no cron or
 * background worker is required and there is no window where an expired promo
 * still grants access.
 */
export const revokeExpiredPromoIfNeeded = async (user) => {
  const sub = user?.subscription;

  // Only ever touches an entitlement that is still owned by the promo.
  if (sub?.status !== 'promo') return false;
  if (!sub.promoEndsAt || sub.promoEndsAt.getTime() > Date.now()) return false;

  sub.status = 'canceled';
  sub.premium = false;
  sub.promoExpiredAt = new Date();
  sub.cancelReason = 'promo_expired';
  await user.save();

  return true;
};

const releaseClaim = async (promo) => {
  try {
    // Only release the exact claim we made (matched on redeemedAt).
    await PromoCode.updateOne(
      { _id: promo._id, redeemedBy: promo.redeemedBy, redeemedAt: promo.redeemedAt },
      { $set: { redeemedBy: null, redeemedAt: null, redemptionEmail: null } }
    );
  } catch (err) {
    console.error(
      `Promo redemption: could not release claim for ${maskCode(promo.code)}:`,
      err.message
    );
  }
};

/**
 * Redeem `code` for the account behind `userId`.
 * Throws an error with `.status` / `.code` for the controller to translate.
 */
export const redeemPromoCodeService = async ({ userId, code }) => {
  // normalizeCode also strips anything that could alter the query shape,
  // and caps the length.
  const normalized = normalizeCode(code);
  if (!normalized) throw httpError('Enter a promo code.', 400, 'PROMO_CODE_REQUIRED');

  const user = await userModel.findById(userId);
  if (!user) throw httpError('Account not found.', 401, 'USER_NOT_FOUND');

  // Idempotency for THIS user and THIS code, checked before the
  // already-subscribed guard below. Without it a double-click, a retry after a
  // dropped connection, or a reload of the success screen would report "you
  // already have a subscription" instead of confirming the grant they already
  // hold. Only an exact match on their own promo qualifies, so somebody holding
  // a *different* promo is still correctly refused.
  if (
    user.subscription?.promoCodeText === normalized &&
    user.subscription?.promoCodeId
  ) {
    const owned = await PromoCode.findById(user.subscription.promoCodeId)
      .select('title')
      .lean();

    return {
      alreadyRedeemed: true,
      code: normalized,
      title: owned?.title || null,
      endsAt: user.subscription.promoEndsAt || null,
      months: PROMO_SUBSCRIPTION_MONTHS,
    };
  }

  // Refuse BEFORE touching the code so an ineligible attempt leaves the code
  // redeemable by somebody else.
  if (hasAnySubscription(user) || hasActiveEntitlement(user)) {
    throw httpError(
      'This account already has an active subscription, so this promo code cannot be applied.',
      409,
      'ALREADY_SUBSCRIBED'
    );
  }

  const now = new Date();
  const promoEndsAt = addCalendarMonths(now, PROMO_SUBSCRIPTION_MONTHS);

  // --- Atomic single-use claim -------------------------------------------
  const promo = await PromoCode.findOneAndUpdate(
    { code: normalized, isActive: true, redeemedBy: null },
    {
      $set: {
        redeemedBy: user._id,
        redeemedAt: now,
        redemptionEmail: user.email,
      },
    },
    { new: true }
  );

  if (!promo) {
    // Either it never existed, it was deactivated, or someone already used it.
    // If *this* user is the one who used it, report their own grant so a
    // double-click or a retried request is not shown as a failure.
    const existing = await PromoCode.findOne({ code: normalized })
      .select('title redeemedBy')
      .lean();

    if (existing?.redeemedBy && String(existing.redeemedBy) === String(user._id)) {
      return {
        alreadyRedeemed: true,
        code: normalized,
        title: existing.title,
        endsAt: user.subscription?.promoEndsAt || null,
        months: PROMO_SUBSCRIPTION_MONTHS,
      };
    }

    throw httpError(INVALID_CODE_MESSAGE, 400, 'PROMO_CODE_INVALID');
  }

  // --- Grant the entitlement ---------------------------------------------
  try {
    user.subscription = {
      ...(user.subscription?.toObject?.() || user.subscription || {}),
      status: 'promo',
      premium: true,
      // Latched so a later purchase cannot also hand out the 3-day trial on
      // top of the 6 free months.
      trialUsedAt: user.subscription?.trialUsedAt || now,
      promoCodeId: promo._id,
      promoCodeText: promo.code,
      promoRedeemedAt: now,
      promoEndsAt,
      promoExpiredAt: null,
      graceEndsAt: null,
      suspendNotifiedAt: null,
      cancelAtPeriodEnd: false,
      canceledAt: null,
      canceledBy: null,
      cancelReason: null,
    };
    await user.save();
  } catch (err) {
    // The user did not get access, so the code must not stay consumed.
    await releaseClaim(promo);
    console.error(`Promo redemption: grant failed for ${maskCode(promo.code)}:`, err.message);
    throw httpError(
      'We could not apply this promo right now. Please try again.',
      500,
      'PROMO_REDEMPTION_FAILED'
    );
  }

  // Confirmation is best effort — a failed email must not undo the grant.
  try {
    await notifyUser({
      userId: user._id,
      title: 'Promo code redeemed',
      message: `${PROMO_SUBSCRIPTION_MONTHS} months of free PrepRX premium access has been added to your account.`,
      emailSubject: `Your ${PROMO_SUBSCRIPTION_MONTHS} months of free PrepRX access is active`,
      emailLines: [
        `Hi ${user.username},`,
        `Your promo code has been applied. We have added ${PROMO_SUBSCRIPTION_MONTHS} months of free PrepRX premium access to your account.`,
        `Your free access runs until ${promoEndsAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}.`,
        'After that, you can continue with any of our plans whenever you are ready.',
      ],
    });
  } catch (err) {
    console.error('Promo redemption: confirmation notification failed:', err.message);
  }

  return {
    alreadyRedeemed: false,
    code: promo.code,
    title: promo.title,
    endsAt: promoEndsAt,
    months: PROMO_SUBSCRIPTION_MONTHS,
  };
};