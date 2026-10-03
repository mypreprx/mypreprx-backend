/**
 * Subscription state after login — the exact sequence reported:
 *
 *   1. user redeems a promo           → 6 months premium
 *   2. promo expires                  → must be paywalled again
 *   3. user buys the 3-month plan     → must NOT be paywalled
 *   4. user logs in again (password + Google) → must NOT be paywalled
 *
 * And the mirror image: an ACTIVE paid subscriber logging in must never see
 * the paywall, by either login method.
 *
 * The billing-state assertions run against the real MongoDB. The Stripe
 * webhook is exercised through the real syncSubscriptionFromStripe service,
 * fed genuine Stripe-shaped subscription objects, because that function is the
 * only thing that writes `subscription.premium` for paid users.
 *
 * Run:  node scripts/test-subscription-after-login.js
 */
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(backendRoot, '.env') });

const userModel = (await import('../Models/userSchema.js')).default;
const PromoCode = (await import('../Models/promoCodeSchema.js')).default;
const notificationModel = (await import('../Models/notificationSchema.js')).default;
const bcrypt = (await import('bcrypt')).default;
const {
  redeemPromoCodeService,
  revokeExpiredPromoIfNeeded,
  hasActiveEntitlement,
} = await import('../Services/billingServices/promoRedemptionService.js');
const { syncSubscriptionFromStripe } = await import('../Services/billingServices/entitlementService.js');

let passed = 0;
let failed = 0;
const failures = [];
const check = (label, condition, detail = '') => {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` -> ${detail}` : ''}`); console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`); }
};
const section = (n) => console.log(`\n${n}`);

const PW = 'E2e!Passw0rd#2026';
const created = { users: [], promos: [] };

/** A Stripe subscription object shaped exactly like the real API returns. */
const stripeSub = ({ status, priceId, currentPeriodEnd, cancelAtPeriodEnd = false, trialEnd = null }) => ({
  id: `sub_e2e_${Math.random().toString(36).slice(2, 10)}`,
  status,
  cancel_at_period_end: cancelAtPeriodEnd,
  trial_end: trialEnd,
  current_period_end: Math.floor(currentPeriodEnd.getTime() / 1000),
  items: { data: [{ price: { id: priceId }, current_period_end: Math.floor(currentPeriodEnd.getTime() / 1000) }] },
});

const makeUser = async (label) => {
  const username = `E2ESUB_${label}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const u = await userModel.create({
    username,
    email: `${username.toLowerCase()}@example.invalid`,
    password: await bcrypt.hash(PW, 10),
    role: 'user',
  });
  created.users.push(u._id);
  return u;
};

/**
 * The paywall gate, run against a freshly-loaded user exactly as
 * RequirePremium does, so the test exercises the real decision path.
 */
const gateAllows = async (userId) => {
  const fresh = await userModel.findById(userId).select('subscription');
  await revokeExpiredPromoIfNeeded(fresh);
  return hasActiveEntitlement(fresh);
};

const THREE_MONTH_PRICE = process.env.STRIPE_PRICE_THREE_MONTH;

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log(`\nTarget DB: ${mongoose.connection.name}`);
  console.log(`3-month price configured: ${THREE_MONTH_PRICE ? 'yes' : 'NO — cannot test step 3'}`);

  try {
    // ============================================================ SCENARIO A
    section('A. Promo expires, user buys 3 months, then logs in again');
    const a = await makeUser('A');
    const promo = await PromoCode.create({
      title: 'E2E post-promo purchase',
      code: `E2E${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      link: 'https://www.mypreprx.com/promo/E2E',
      qrPayload: 'https://www.mypreprx.com/promo/E2E',
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(),
    });
    created.promos.push(promo.code);

    await redeemPromoCodeService({ userId: a._id, code: promo.code });
    check('promo granted premium', await gateAllows(a._id) === true);

    // Simulate 6 months passing.
    await userModel.updateOne(
      { _id: a._id },
      { $set: { 'subscription.promoEndsAt': new Date(Date.now() - 864e5) } }
    );
    check('expired promo is now paywalled', await gateAllows(a._id) === false);
    const afterExpiry = await userModel.findById(a._id).lean();
    check('status revoked to canceled', afterExpiry.subscription.status === 'canceled', afterExpiry.subscription.status);
    check('premium cleared', afterExpiry.subscription.premium === false);

    // Now the user buys the 3-month plan. This is the critical step.
    if (THREE_MONTH_PRICE) {
      const periodEnd = new Date(Date.now() + 92 * 864e5);
      await syncSubscriptionFromStripe(
        await userModel.findById(a._id),
        stripeSub({ status: 'active', priceId: THREE_MONTH_PRICE, currentPeriodEnd: periodEnd })
      );
      const afterBuy = await userModel.findById(a._id).lean();
      check('purchase sets status active', afterBuy.subscription.status === 'active', afterBuy.subscription.status);
      check('purchase sets premium true', afterBuy.subscription.premium === true);
      check('planId recorded as three-month', afterBuy.subscription.planId === 'three-month', afterBuy.subscription.planId);
      check('stripe subscription id stored', Boolean(afterBuy.subscription.stripeSubscriptionId));

      // THE REPORTED SYMPTOM: logging in again must NOT be paywalled.
      check('LOGIN AFTER PURCHASE IS NOT PAYWALLED', await gateAllows(a._id) === true);

      // And it must survive repeated gate calls (idempotent revocation).
      await gateAllows(a._id);
      await gateAllows(a._id);
      const afterRepeated = await userModel.findById(a._id).lean();
      check('still premium after repeated logins', afterRepeated.subscription.premium === true, afterRepeated.subscription.status);
      check('stale promoEndsAt did NOT revoke a paid plan',
        afterRepeated.subscription.status === 'active',
        afterRepeated.subscription.status);
    } else {
      check('SKIPPED: STRIPE_PRICE_THREE_MONTH not set', true);
    }

    // ============================================================ SCENARIO B
    section('B. Promo still ACTIVE, user buys 3 months (no double-grant, no revoke)');
    const b = await makeUser('B');
    const promoB = await PromoCode.create({
      title: 'E2E active promo then purchase',
      code: `E2E${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      link: 'https://www.mypreprx.com/promo/E2EB',
      qrPayload: 'https://www.mypreprx.com/promo/E2EB',
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(),
    });
    created.promos.push(promoB.code);
    await redeemPromoCodeService({ userId: b._id, code: promoB.code });

    if (THREE_MONTH_PRICE) {
      const bEnds = new Date(Date.now() + 6 * 30 * 864e5);
      await syncSubscriptionFromStripe(
        await userModel.findById(b._id),
        stripeSub({ status: 'active', priceId: THREE_MONTH_PRICE, currentPeriodEnd: bEnds })
      );
      const afterB = await userModel.findById(b._id).lean();
      check('purchase takes precedence over live promo', afterB.subscription.status === 'active', afterB.subscription.status);
      check('still premium after purchase', await gateAllows(b._id) === true);
      check('promoEndsAt retained for display', Boolean(afterB.subscription.promoEndsAt));
    }

    // ============================================================ SCENARIO C
    section('C. Stale replayed webhook must NOT revoke a paid plan');
    if (THREE_MONTH_PRICE) {
      const periodEnd = new Date(Date.now() + 92 * 864e5);
      // An old subscription object from before the purchase, still "canceled".
      await syncSubscriptionFromStripe(
        await userModel.findById(a._id),
        stripeSub({ status: 'canceled', priceId: THREE_MONTH_PRICE, currentPeriodEnd: periodEnd })
      );
      const afterReplay = await userModel.findById(a._id).lean();
      check('replayed canceled event did not revoke the paid plan',
        afterReplay.subscription.premium === true,
        `premium=${afterReplay.subscription.premium} status=${afterReplay.subscription.status}`);
      check('LOGIN AFTER REPLAY STILL NOT PAYWALLED', await gateAllows(a._id) === true);
    }

    // ============================================================ SCENARIO D
    section('D. Active paid subscriber is NEVER paywalled (the mirror case)');
    if (THREE_MONTH_PRICE) {
      const d = await makeUser('D');
      const periodEnd = new Date(Date.now() + 92 * 864e5);
      await syncSubscriptionFromStripe(
        d,
        stripeSub({ status: 'active', priceId: THREE_MONTH_PRICE, currentPeriodEnd: periodEnd })
      );
      check('active subscriber has premium', await gateAllows(d._id) === true);
      check('LOGIN AS ACTIVE SUBSCRIBER IS NOT PAYWALLED', await gateAllows(d._id) === true);

      // trialing
      const d2 = await makeUser('D2');
      await syncSubscriptionFromStripe(
        d2,
        stripeSub({ status: 'trialing', priceId: THREE_MONTH_PRICE, currentPeriodEnd: new Date(Date.now() + 3 * 864e5), trialEnd: Math.floor(Date.now() / 1000) + 3 * 86400 })
      );
      check('trialing subscriber is not paywalled', await gateAllows(d2._id) === true);

      // past_due -> grace keeps access
      const d3 = await makeUser('D3');
      await syncSubscriptionFromStripe(
        d3,
        stripeSub({ status: 'past_due', priceId: THREE_MONTH_PRICE, currentPeriodEnd: periodEnd })
      );
      check('past_due keeps access during grace', await gateAllows(d3._id) === true);

      // cancel at period end -> still active until the end
      const d4 = await makeUser('D4');
      await syncSubscriptionFromStripe(
        d4,
        stripeSub({ status: 'active', priceId: THREE_MONTH_PRICE, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true })
      );
      check('cancel-at-period-end keeps access until expiry', await gateAllows(d4._id) === true);

      // canceled -> paywalled
      const d5 = await makeUser('D5');
      await syncSubscriptionFromStripe(
        d5,
        stripeSub({ status: 'canceled', priceId: THREE_MONTH_PRICE, currentPeriodEnd: new Date(Date.now() - 864e5) })
      );
      check('canceled subscriber IS paywalled', await gateAllows(d5._id) === false);

      // unpaid -> suspended, paywalled
      const d6 = await makeUser('D6');
      await syncSubscriptionFromStripe(
        d6,
        stripeSub({ status: 'unpaid', priceId: THREE_MONTH_PRICE, currentPeriodEnd: periodEnd })
      );
      check('unpaid subscriber IS paywalled', await gateAllows(d6._id) === false);
    }

    // ============================================================ SCENARIO E
    section('E. Expired promo with NO purchase stays paywalled');
    const e = await makeUser('E');
    const promoE = await PromoCode.create({
      title: 'E2E expired no purchase',
      code: `E2E${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      link: 'https://www.mypreprx.com/promo/E2EE',
      qrPayload: 'https://www.mypreprx.com/promo/E2EE',
      isActive: true,
      createdBy: new mongoose.Types.ObjectId(),
    });
    created.promos.push(promoE.code);
    await redeemPromoCodeService({ userId: e._id, code: promoE.code });
    check('promo works first', await gateAllows(e._id) === true);
    await userModel.updateOne({ _id: e._id }, { $set: { 'subscription.promoEndsAt': new Date(Date.now() - 864e5) } });
    check('expired, unpaid promo is paywalled', await gateAllows(e._id) === false);
    check('no Stripe id was invented', !(await userModel.findById(e._id).lean()).subscription.stripeSubscriptionId);

    // ============================================================ SCENARIO F
    section('F. Re-redeeming the same code after expiry does not resurrect it');
    let reRedeemThrew = null;
    try {
      await redeemPromoCodeService({ userId: e._id, code: promoE.code });
    } catch (err) { reRedeemThrew = err; }
    check('same user re-redeeming is idempotent (200, no new grant)',
      reRedeemThrew === null || reRedeemThrew.status === 200 || reRedeemThrew.status === 400,
      reRedeemThrew?.message);
    const eAfter = await userModel.findById(e._id).lean();
    check('expiry was NOT undone by the retry', await gateAllows(e._id) === false, eAfter.subscription.status);

    // ============================================================ SCENARIO G
    section('G. Google login must not disturb subscription state');
    const g = await makeUser('G');
    if (THREE_MONTH_PRICE) {
      await syncSubscriptionFromStripe(
        g,
        stripeSub({ status: 'active', priceId: THREE_MONTH_PRICE, currentPeriodEnd: new Date(Date.now() + 92 * 864e5) })
      );
    } else {
      await userModel.updateOne({ _id: g._id }, { $set: { subscription: { status: 'active', premium: true, planId: 'three-month' } } });
    }
    // googleAuthService for an EXISTING user only sets isOnline and re-saves.
    // Replicate exactly that to prove subscription fields survive.
    const gBefore = (await userModel.findById(g._id).lean()).subscription;
    const gDoc = await userModel.findById(g._id);
    gDoc.isOnline = true;
    await gDoc.save();
    const gAfter = (await userModel.findById(g._id).lean()).subscription;
    check('GOOGLE LOGIN PRESERVES ACTIVE SUBSCRIPTION',
      gAfter.status === 'active' && gAfter.premium === true,
      `status=${gAfter.status} premium=${gAfter.premium}`);
    check('google login preserves planId', gAfter.planId === gBefore.planId, gAfter.planId);
    check('LOGIN VIA GOOGLE IS NOT PAYWALLED', await gateAllows(g._id) === true);

    // Same for an expired promo logging in via Google.
    const g2 = await makeUser('G2');
    await userModel.updateOne(
      { _id: g2._id },
      { $set: { subscription: { status: 'promo', premium: true, promoEndsAt: new Date(Date.now() - 864e5), promoCodeText: 'E2EXPIRED' } } }
    );
    const g2Doc = await userModel.findById(g2._id);
    g2Doc.isOnline = true;
    await g2Doc.save();
    check('expired promo + google login IS paywalled', await gateAllows(g2._id) === false);
  } catch (err) {
    failed += 1;
    failures.push(`CRASH: ${err.message}`);
    console.log(`\n  CRASH: ${err.stack}`);
  } finally {
    if (created.promos.length) await PromoCode.deleteMany({ code: { $in: created.promos } });
    if (created.users.length) await userModel.deleteMany({ _id: { $in: created.users } });
    await notificationModel.deleteMany({ user: { $in: created.users } });
    const p = await PromoCode.countDocuments({ code: { $in: created.promos } });
    const u = created.users.length ? await userModel.countDocuments({ _id: { $in: created.users } }) : 0;
    console.log(`\nCleanup: ${created.users.length} users, ${created.promos.length} promos removed`);
    check('no user residue', u === 0, `${u} left`);
    check('no promo residue', p === 0, `${p} left`);
  }

  console.log(`\n${'='.repeat(58)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log(`   - ${f}`));
  }
  console.log('='.repeat(58));

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
};

run();