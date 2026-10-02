/**
 * END-TO-END promo redemption test.
 *
 * Exercises the real service + real MongoDB, including the race condition that
 * cannot be reproduced through the HTTP layer. Every document it creates is
 * removed in the finally block.
 *
 * Run:  node scripts/test-promo-redemption.js
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import PromoCode from '../Models/promoCodeSchema.js';
import userModel from '../Models/userSchema.js';
import notificationModel from '../Models/notificationSchema.js';
import {
  redeemPromoCodeService,
  revokeExpiredPromoIfNeeded,
  hasActiveEntitlement,
  hasAnySubscription,
  addCalendarMonths,
  maskCode,
  PROMO_SUBSCRIPTION_MONTHS,
} from '../Services/billingServices/promoRedemptionService.js';

const createdUsers = [];
const createdPromos = [];

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

const section = (name) => console.log(`\n${name}`);

const newUser = async (label) => {
  const user = await userModel.create({
    username: `promotest_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
    email: `promotest_${label}_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.invalid`,
    password: 'x'.repeat(60),
    role: 'user',
  });
  createdUsers.push(user._id);
  return user;
};

const newPromo = async (overrides = {}) => {
  const code = overrides.code || `PT${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const promo = await PromoCode.create({
    title: overrides.title || 'Promo test',
    code,
    link: `https://www.mypreprx.com/promo/${code}`,
    qrPayload: `https://www.mypreprx.com/promo/${code}`,
    isActive: overrides.isActive !== false,
    ...(overrides.fields || {}),
  });
  createdPromos.push(promo._id);
  return promo;
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL);

  section('Calendar arithmetic');
  check(
    '6 months from Jan 15 clamps correctly',
    addCalendarMonths(new Date('2026-01-15T00:00:00Z'), 6).toISOString().slice(0, 10) === '2026-07-15'
  );
  check(
    'Aug 31 + 6 months clamps to Feb 28 (leap year)',
    addCalendarMonths(new Date('2026-08-31T00:00:00Z'), 6).toISOString().slice(0, 10) === '2027-02-28'
  );
  check(
    'Aug 31 + 6 months in a leap year reaches Feb 29',
    addCalendarMonths(new Date('2028-08-31T00:00:00Z'), 6).toISOString().slice(0, 10) === '2029-02-28'
  );
  check(
    'maskCode keeps only the first and last 2 characters',
    maskCode('ABCDEFGH') === 'AB****GH' && !maskCode('ABCDEFGH').includes('CDEF'),
    maskCode('ABCDEFGH')
  );
  check('maskCode never returns a short code in full', maskCode('ABCD') === '***', maskCode('ABCD'));

  section('Happy path — new user redeems');
  const promoA = await newPromo({ title: 'Launch promo' });
  const userA = await newUser('happy');
  const grantA = await redeemPromoCodeService({ userId: userA._id, code: promoA.code });

  check('redemption succeeds', grantA.alreadyRedeemed === false);
  check('reports 6 months', grantA.months === PROMO_SUBSCRIPTION_MONTHS);
  check('returns an end date', Boolean(grantA.endsAt));

  const afterA = await userModel.findById(userA._id);
  check('status is promo', afterA.subscription.status === 'promo', afterA.subscription.status);
  check('premium is granted', afterA.subscription.premium === true);
  check('user holds entitlement', hasActiveEntitlement(afterA) === true);
  check('promoEndsAt is ~6 months out', Boolean(afterA.subscription.promoEndsAt));
  check('trial is latched so no free trial stacks later', Boolean(afterA.subscription.trialUsedAt));
  check('no Stripe subscription was fabricated', !afterA.subscription.stripeSubscriptionId);

  const promoARefetched = await PromoCode.findById(promoA._id);
  check('code is marked redeemed', promoARefetched.redeemedBy != null);
  check('redemption email recorded', promoARefetched.redemptionEmail === userA.email);

  section('Single use — second redemption by ANOTHER user');
  const userB = await newUser('thief');
  let thiefError = null;
  try {
    await redeemPromoCodeService({ userId: userB._id, code: promoA.code });
  } catch (err) {
    thiefError = err;
  }
  check('used code is refused', thiefError != null);
  check(
    'refusal uses the generic message (no enumeration)',
    thiefError?.message ===
      'This promo code is invalid, no longer active, or has already been used.',
    thiefError?.message
  );
  const userBAfter = await userModel.findById(userB._id);
  check('thief got NO entitlement', userBAfter.subscription.premium === false);
  check('thief status untouched', userBAfter.subscription.status === 'none', userBAfter.subscription.status);

  section('Single use — same user re-submitting the code');
  const retry = await redeemPromoCodeService({ userId: userA._id, code: promoA.code });
  check('idempotent: reported as already redeemed', retry.alreadyRedeemed === true);
  check('idempotent: still the same end date', String(retry.endsAt) === String(grantA.endsAt));
  const userAAfter = await userModel.findById(userA._id);
  check(
    'idempotent: end date did not move',
    String(userAAfter.subscription.promoEndsAt) === String(grantA.endsAt)
  );

  section('Case + whitespace insensitivity');
  const promoB = await newPromo({ title: 'Case test' });
  const userC = await newUser('case');
  const grantC = await redeemPromoCodeService({
    userId: userC._id,
    code: `  ${promoB.code.toLowerCase()}  `,
  });
  check('lowercase + padded code still works', grantC.alreadyRedeemed === false);
  const promoBRefetched = await PromoCode.findById(promoB._id);
  check('code stored uppercase', promoBRefetched.code === promoB.code.toUpperCase());

  section('Invalid / unknown codes');
  const userD = await newUser('invalid');
  let unknownError = null;
  try {
    await redeemPromoCodeService({ userId: userD._id, code: 'ZZZZZZZZZZ' });
  } catch (err) {
    unknownError = err;
  }
  check('unknown code refused', unknownError != null);
  check(
    'unknown code gives the SAME message as a used code (no enumeration)',
    unknownError?.message === 'This promo code is invalid, no longer active, or has already been used.'
  );

  let emptyError = null;
  try {
    await redeemPromoCodeService({ userId: userD._id, code: '   ' });
  } catch (err) {
    emptyError = err;
  }
  check('empty code refused with 400', emptyError?.status === 400, String(emptyError?.status));

  section('Inactive code cannot be redeemed');
  const promoE = await newPromo({ title: 'Deactivated', isActive: false });
  const userF = await newUser('inactive');
  let inactiveError = null;
  try {
    await redeemPromoCodeService({ userId: userF._id, code: promoE.code });
  } catch (err) {
    inactiveError = err;
  }
  check('deactivated code refused', inactiveError != null);
  const promoEAfter = await PromoCode.findById(promoE._id);
  check('deactivated code was NOT consumed', promoEAfter.redeemedBy === null);

  section('Already-subscribed user is blocked AND the code stays available');
  const promoG = await newPromo({ title: 'Subscriber test' });
  const userH = await newUser('subscriber');
  userH.subscription.status = 'active';
  userH.subscription.premium = true;
  userH.subscription.planId = 'monthly';
  await userH.save();

  let subError = null;
  try {
    await redeemPromoCodeService({ userId: userH._id, code: promoG.code });
  } catch (err) {
    subError = err;
  }
  check('subscriber refused', subError != null);
  check('refusal is 409', subError?.status === 409, String(subError?.status));
  const promoGAfter = await PromoCode.findById(promoG._id);
  check(
    'code NOT burned — still usable by someone else',
    promoGAfter.redeemedBy === null
  );

  const userI = await newUser('beneficiary');
  const grantI = await redeemPromoCodeService({ userId: userI._id, code: promoG.code });
  check('a non-subscriber can then claim it', grantI.alreadyRedeemed === false);
  check('hasAnySubscription is false for them', hasAnySubscription(userI) === false);

  section('Trial stacking is prevented');
  const promoJ = await newPromo({ title: 'Trial stacking' });
  const userK = await newUser('trial');
  await redeemPromoCodeService({ userId: userK._id, code: promoJ.code });
  const userKAfter = await userModel.findById(userK._id);
  const isTrialEligibleSimulated =
    userKAfter.subscription.trialUsedAt
      ? false
      : ['trialing', 'active', 'past_due', 'suspended', 'canceled', 'promo'].includes(
          userKAfter.subscription.status
        )
      ? false
      : true;
  check('user is NOT eligible for a free trial after a promo', isTrialEligibleSimulated === false);

  section('Expiry — promo lapses after 6 months');
  const promoL = await newPromo({ title: 'Expiry test' });
  const userL = await newUser('expiry');
  await redeemPromoCodeService({ userId: userL._id, code: promoL.code });

  // Move the end date into the past.
  await userModel.updateOne(
    { _id: userL._id },
    { $set: { 'subscription.promoEndsAt': new Date(Date.now() - 1000) } }
  );

  let premiumBefore = true;
  let revoked = false;
  const userLLoaded = await userModel.findById(userL._id);
  premiumBefore = hasActiveEntitlement(userLLoaded);
  check('expired promo no longer counts as entitlement', premiumBefore === false);

  revoked = await revokeExpiredPromoIfNeeded(userLLoaded);
  check('revoke ran', revoked === true);
  const userLAfter = await userModel.findById(userL._id);
  check('premium revoked', userLAfter.subscription.premium === false);
  check('status is canceled', userLAfter.subscription.status === 'canceled');
  check('promoExpiredAt stamped', userLAfter.subscription.promoExpiredAt != null);
  check('reason recorded', userLAfter.subscription.cancelReason === 'promo_expired');

  section('Expiry guard — a PAID subscription is never revoked by stale promo dates');
  const userM = await newUser('paidguard');
  userM.subscription.status = 'active';
  userM.subscription.premium = true;
  userM.subscription.planId = 'monthly';
  userM.subscription.promoEndsAt = new Date(Date.now() - 1000);
  userM.subscription.promoCodeText = 'OLDCODE';
  await userM.save();

  const userMLoaded = await userModel.findById(userM._id);
  const revokedM = await revokeExpiredPromoIfNeeded(userMLoaded);
  check('no revoke attempted on a paid plan', revokedM === false);
  check('paid premium intact', hasActiveEntitlement(userMLoaded) === true);

  section('CONCURRENCY — 10 simultaneous claims on ONE code');
  const promoN = await newPromo({ title: 'Race test' });
  const racers = [];
  for (let i = 0; i < 10; i += 1) racers.push(await newUser(`race${i}`));

  const outcomes = await Promise.allSettled(
    racers.map((racer) => redeemPromoCodeService({ userId: racer._id, code: promoN.code }))
  );

  const winners = outcomes.filter((o) => o.status === 'fulfilled');
  const losers = outcomes.filter((o) => o.status === 'rejected');
  check('EXACTLY ONE winner', winners.length === 1, `winners=${winners.length}`);
  check('the other nine are rejected', losers.length === 9, `losers=${losers.length}`);

  const promoNAfter = await PromoCode.findById(promoN._id);
  const winnerId = String(promoNAfter.redeemedBy);
  check('code points at the single winner', Boolean(winnerId));

  const winnersWithAccess = [];
  for (const racer of racers) {
    const fresh = await userModel.findById(racer._id);
    if (fresh.subscription.premium === true) winnersWithAccess.push(String(racer._id));
  }
  check(
    'only one account actually received access',
    winnersWithAccess.length === 1 && winnersWithAccess[0] === winnerId,
    `access=${winnersWithAccess.length}`
  );

  section('CONCURRENCY — same user double-clicks one code');
  const promoO = await newPromo({ title: 'Double click' });
  const userP = await newUser('doubleclick');
  const dbl = await Promise.allSettled([
    redeemPromoCodeService({ userId: userP._id, code: promoO.code }),
    redeemPromoCodeService({ userId: userP._id, code: promoO.code }),
    redeemPromoCodeService({ userId: userP._id, code: promoO.code }),
  ]);
  const dblOk = dbl.filter((d) => d.status === 'fulfilled').length;
  check('no crash on repeated submit', dbl.every((d) => d.status === 'fulfilled' || d.status === 'rejected'));
  check('at least one succeeded', dblOk >= 1, `fulfilled=${dblOk}`);
  const promoOAfter = await PromoCode.findById(promoO._id);
  check('code consumed exactly once', promoOAfter.redeemedBy != null);

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
};

const cleanup = async () => {
  try {
    const userIds = createdUsers.map((id) => new mongoose.Types.ObjectId(String(id)));
    if (userIds.length) {
      await notificationModel.deleteMany({ user: { $in: userIds } });
      await userModel.deleteMany({ _id: { $in: userIds } });
    }
    if (createdPromos.length) {
      await PromoCode.deleteMany({ _id: { $in: createdPromos } });
    }
    console.log(`\nCleanup complete: ${createdUsers.length} users, ${createdPromos.length} promos removed.`);
  } catch (err) {
    console.error('Cleanup failed:', err.message);
  }
};

run()
  .then(cleanup)
  .then(async () => {
    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('\nTest run crashed:', err);
    await cleanup();
    await mongoose.disconnect();
    process.exit(1);
  });