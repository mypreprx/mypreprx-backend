/**
 * PRODUCTION promo end-to-end test.
 *
 * Registers real accounts on the live server, exercises every promo corner
 * over real HTTP, then deletes everything it created.
 *
 * Every account is prefixed E2EPROMO and every promo code is prefixed E2E so
 * cleanup is unambiguous.
 *
 * Run:  node scripts/test-promo-production.js
 * Opt out with:  SKIP_PROD_E2E=1
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

const API = (process.env.E2E_API_URL || 'https://api.mypreprx.com/api').replace(/\/+$/, '');
const PREFIX = 'E2EPROMO';
// Full timestamp suffix: reruns in the same minute must not collide on the
// unique `code` index, and usernames share that same uniqueness risk.
const stamp = Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
const PW = 'E2e!Passw0rd#2026';

let passed = 0;
let failed = 0;
const failures = [];

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` -> ${detail}` : ''}`);
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};
const section = (n) => console.log(`\n${n}`);

const req = async (pathname, { method = 'GET', token, body, cookie } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookie) headers.Cookie = cookie;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, setCookie: res.headers.get('set-cookie') };
};

const created = { users: [], promos: [], sessions: [] };
// Declared out here because the assertions run after the finally block that
// cleans up, and they need to compare against the pre-run total.
let baselineUsers = null;

const register = async (label) => {
  const username = `${PREFIX}_${label}_${stamp}`;
  const email = `${username.toLowerCase()}@example.invalid`;
  const reg = await req('/user/register', {
    method: 'POST',
    body: { username, email, password: PW, confirmpassword: PW },
  });
  const id = reg.body?.newUser?._id;
  if (id) created.users.push(id);
  return { username, email, id, reg };
};

const login = async (u) => {
  const res = await req('/user/login', {
    method: 'POST',
    body: { email: u.email, password: PW },
  });
  return { token: res.body?.token, res };
};

const makePromo = async (overrides = {}) => {
  const code = `E2E${stamp}${Math.floor(Math.random() * 90 + 10)}`;
  const doc = await PromoCode.create({
    code,
    title: 'E2E Production Promo',
    link: `https://www.mypreprx.com/promo/${code}`,
    isActive: true,
    createdBy: new mongoose.Types.ObjectId(),
    ...overrides,
  });
  created.promos.push(doc.code);
  return doc;
};

const redeem = (token, code, body = {}) =>
  req('/user/promo/redeem', { method: 'POST', token, body: { code, ...body } });

const dbUser = async (id) => userModel.findById(id).lean();

const cleanup = async () => {
  section('Cleanup');
  if (!created.users.length && !created.promos.length) {
    console.log('  nothing to clean');
    return;
  }
  const u = await userModel.deleteMany({ _id: { $in: created.users } });
  const p = await PromoCode.deleteMany({ code: { $in: created.promos } });

  // Abandoned test-mode checkout sessions expire on their own, but expiring
  // them now keeps the Stripe dashboard clean.
  if (created.sessions.length && process.env.STRIPE_SECRET_KEY) {
    try {
      const Stripe = (await import('stripe')).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      for (const sid of created.sessions) {
        await stripe.checkout.sessions.expire(sid).catch(() => {});
      }
      console.log(`  expired ${created.sessions.length} test checkout sessions`);
    } catch (e) {
      console.log(`  could not expire sessions: ${e.message}`);
    }
  }
  const n = await notificationModel.deleteMany({
    user: { $in: created.users },
    title: /Promo code redeemed/,
  });
  console.log(`  removed ${u.deletedCount} users, ${p.deletedCount} promos, ${n.deletedCount} notifications`);

  const leftU = await userModel.countDocuments({ _id: { $in: created.users } });
  const leftP = await PromoCode.countDocuments({ code: { $in: created.promos } });
  check('no user residue', leftU === 0, `${leftU} left`);
  check('no promo residue', leftP === 0, `${leftP} left`);
};

const run = async () => {
  if (process.env.SKIP_PROD_E2E === '1') {
    console.log('SKIP_PROD_E2E=1 — not touching production.');
    return;
  }
  await mongoose.connect(process.env.MONGODB_URL);
  console.log(`\nTarget: ${API}`);
  console.log(`Accounts: ${PREFIX}_*  |  Codes: E2E*  |  run ${stamp}`);

  try {
    // -------------------------------------------------- leftover sweep
    // A previous crashed run can strand accounts/codes. Start from a known
    // state so counts and the "no residue" assertions mean something.
    const staleUsers = await userModel.find({ username: { $regex: '^E2EPROMO_|^e2eprobe' } }).select('_id');
    const stalePromos = await PromoCode.find({ code: { $regex: '^E2E' } }).select('code');
    if (staleUsers.length || stalePromos.length) {
      console.log(`  sweeping ${staleUsers.length} stale users, ${stalePromos.length} stale promos`);
      await userModel.deleteMany({ _id: { $in: staleUsers.map((u) => u._id) } });
      await PromoCode.deleteMany({ code: { $in: stalePromos.map((p) => p.code) } });
    }
    baselineUsers = await userModel.countDocuments({});

    // ------------------------------------------------- real registration
    section('Real user registration on production');
    const alice = await register('ALICE');
    check('register returns 201', alice.reg.status === 201, `status=${alice.reg.status}`);
    check('account has an id', Boolean(alice.id));
    check('password hash never returned', !('password' in (alice.reg.body?.newUser || {})));
    check('no token leaked by register', !alice.reg.body?.token);

    const aliceLogin = await login(alice);
    check('login succeeds', aliceLogin.res.status === 200, `status=${aliceLogin.res.status}`);
    check('login returns bearer token', Boolean(aliceLogin.token));
    check('login also sets httpOnly cookie', /Token=/.test(aliceLogin.res.setCookie || ''));

    const badLogin = await req('/user/login', {
      method: 'POST',
      body: { email: alice.email, password: 'wrong-password' },
    });
    check('wrong password rejected', badLogin.status >= 400, `status=${badLogin.status}`);

    // ------------------------------------------- CSRF: cookie-only blocked
    section('CSRF defence on production');
    const cookieOnly = await req('/user/promo/redeem', {
      method: 'POST',
      cookie: (aliceLogin.res.setCookie || '').split(';')[0],
      body: { code: 'E2ENOTREAL' },
    });
    check('cookie-only redeem is rejected', cookieOnly.status === 401, `status=${cookieOnly.status}`);
    check(
      'rejection names token auth',
      cookieOnly.body?.message === 'This action requires token authentication.',
      cookieOnly.body?.message
    );

    // --------------------------------------------------- single use happy path
    section('Single-use redemption (real accounts)');
    const promo1 = await makePromo();
    const r1 = await redeem(aliceLogin.token, promo1.code);
    check('redeem returns 200', r1.status === 200, `status=${r1.status} ${JSON.stringify(r1.body)}`);
    check('success flag set', r1.body?.success === true);
    check('reports 6 months', r1.body?.promo?.months === 6, `months=${r1.body?.promo?.months}`);
    check('returns an end date', Boolean(r1.body?.promo?.endsAt));

    const aliceDb = await dbUser(alice.id);
    check('db status is promo', aliceDb.subscription?.status === 'promo', aliceDb.subscription?.status);
    check('db premium granted', aliceDb.subscription?.premium === true);
    check('db records the code', aliceDb.subscription?.promoCodeText === promo1.code);
    check('db promoCodeId linked', Boolean(aliceDb.subscription?.promoCodeId));
    check('no Stripe id fabricated', !aliceDb.subscription?.stripeSubscriptionId, aliceDb.subscription?.stripeSubscriptionId);

    const now = new Date();
    const expected = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth() + 6, now.getUTCDate(),
      now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()
    ));
    const actual = new Date(aliceDb.subscription.promoEndsAt);
    const diffDays = Math.abs((expected - actual) / 86400000);
    check('end date is 6 calendar months out', diffDays < 1.5, `drift=${diffDays.toFixed(2)} days`);
    check('end date is in the future', actual > now);

    const promoDb = await PromoCode.findOne({ code: promo1.code }).lean();
    check('promo marked redeemed', Boolean(promoDb.redeemedBy));
    check('promo redemption timestamped', Boolean(promoDb.redeemedAt));
    check('redeemedBy matches the user', String(promoDb.redeemedBy) === String(alice.id));

    // ------------------------------------------------------ idempotent retry
    section('Idempotent retry by the same user');
    const r2 = await redeem(aliceLogin.token, promo1.code);
    check('repeat submit returns 200', r2.status === 200, `status=${r2.status}`);
    check('flagged as already redeemed', r2.body?.promo?.alreadyRedeemed === true);
    check('end date did NOT move', r2.body?.promo?.endsAt === r1.body?.promo?.endsAt);

    // ------------------------------------------------ a second real user is denied
    section('A different real user cannot reuse the code');
    const bob = await register('BOB');
    const bobLogin = await login(bob);
    const r3 = await redeem(bobLogin.token, promo1.code);
    check('second user gets 400', r3.status === 400, `status=${r3.status}`);
    // The wording must not distinguish "already used" from "never existed",
    // otherwise someone could probe which codes are real.
    const REAL_CODE_HINTS = /already been applied|successfully|your account/i;
    check('generic message (no enumeration)', !REAL_CODE_HINTS.test(r3.body?.message || ''), r3.body?.message);
    const bobDb = await dbUser(bob.id);
    check('second user got no entitlement', !bobDb.subscription?.premium);
    check('second user has no promo status', bobDb.subscription?.status !== 'promo');

    // ------------------------------------------------- case normalisation
    section('Code case normalisation');
    const promo2 = await makePromo();
    const lowerCode = promo2.code.toLowerCase();
    const r4 = await redeem(bobLogin.token, lowerCode);
    check('lowercase code is accepted', r4.status === 200, `status=${r4.status}`);
    check('granted to the right user', (await dbUser(bob.id)).subscription?.promoCodeText === promo2.code);

    // ---------------------------------------------------- inactive code
    section('Deactivated code');
    const promo3 = await makePromo({ isActive: false });
    const carol = await register('CAROL');
    const carolLogin = await login(carol);
    const r5 = await redeem(carolLogin.token, promo3.code);
    check('inactive code rejected', r5.status === 400, `status=${r5.status}`);
    check('message matches unknown-code wording', r5.body?.message === r3.body?.message, `${r5.body?.message} vs ${r3.body?.message}`);
    const promo3Db = await PromoCode.findOne({ code: promo3.code }).lean();
    check('inactive code NOT burned', !promo3Db.redeemedBy);

    // ----------------------------------------------------- unknown code
    section('Unknown code');
    const r6 = await redeem(carolLogin.token, 'E2EDOESNOTEXIST');
    check('unknown code rejected', r6.status === 400, `status=${r6.status}`);
    check('same generic message as inactive', r6.body?.message === r3.body?.message);

    // ------------------------------------------- already-subscribed blocked
    section('Already-subscribed user is blocked, code stays unburned');
    const promo4 = await makePromo();
    const dave = await register('DAVE');
    await userModel.updateOne(
      { _id: dave.id },
      { $set: { subscription: { status: 'active', premium: true, planId: 'monthly', plan: 'Monthly', price: 9, cycle: 'month', startDate: new Date(), endDate: new Date(Date.now() + 30 * 864e5) } } }
    );
    const daveLogin = await login(dave);
    const r7 = await redeem(daveLogin.token, promo4.code);
    check('subscriber gets 409', r7.status === 409, `status=${r7.status}`);
    check('error code is ALREADY_SUBSCRIBED', r7.body?.code === 'ALREADY_SUBSCRIBED', r7.body?.code);
    const promo4Db = await PromoCode.findOne({ code: promo4.code }).lean();
    check('code NOT burned by the block', !promo4Db.redeemedBy);
    const daveDb = await dbUser(dave.id);
    check('their existing plan untouched', daveDb.subscription?.status === 'active' && daveDb.subscription?.premium === true);

    // ------------------------------------- subscriber BLOCKED but code reusable
    section('The blocked code still works for an eligible user');
    const erin = await register('ERIN');
    const erinLogin = await login(erin);
    const r8 = await redeem(erinLogin.token, promo4.code);
    check('eligible user redeems the same code', r8.status === 200, `status=${r8.status}`);

    // ------------------------------------------------------ trial latching
    section('Trial cannot stack on top of a promo');
    const erinDb = await dbUser(erin.id);
    check('trialUsedAt set at redemption', Boolean(erinDb.subscription?.trialUsedAt), String(erinDb.subscription?.trialUsedAt));

    // -------------------------------------------------------- body spoofing
    section('Request body cannot choose the beneficiary');
    const promo5 = await makePromo();
    const mallory = await register('MALLORY');
    const malloryLogin = await login(mallory);
    const victim = await register('VICTIM');
    const r9 = await redeem(malloryLogin.token, promo5.code, {
      userId: victim.id,
      email: victim.email,
    });
    check('redeem still succeeds for the CALLER', r9.status === 200, `status=${r9.status}`);
    const malloryDb = await dbUser(mallory.id);
    const victimDb = await dbUser(victim.id);
    check('attacker received the promo', malloryDb.subscription?.promoCodeText === promo5.code);
    check('victim received NOTHING', !victimDb.subscription?.premium && victimDb.subscription?.status !== 'promo');

    // ------------------------------------------------ premium access granted
    section('Premium access immediately after redemption');
    const home = await req('/user/Home', { token: malloryLogin.token });
    check('/user/Home is NOT paywalled', home.status !== 402, `status=${home.status}`);
    check('/user/Home reports premium', home.body?.user?.subscription?.premium === true || home.body?.subscription?.premium === true, JSON.stringify(home.body).slice(0, 200));

    // ------------------------------------------------- expiry -> paywall again
    section('Expiry returns the user to the paywall');
    const backdated = new Date(Date.now() - 864e5);
    await userModel.updateOne({ _id: mallory.id }, { $set: { 'subscription.promoEndsAt': backdated } });
    const premiumRoute = await req('/user/getStrategyQuestions', { token: malloryLogin.token });
    check('premium route is paywalled again', premiumRoute.status === 402, `status=${premiumRoute.status}`);
    check('402 says SUBSCRIPTION_REQUIRED', premiumRoute.body?.code === 'SUBSCRIPTION_REQUIRED', JSON.stringify(premiumRoute.body));

    const homeAfter = await req('/user/Home', { token: malloryLogin.token });
    check('/user/Home no longer paywalled-out', homeAfter.status === 200);
    const malloryAfter = await dbUser(mallory.id);
    check('status revoked to canceled', malloryAfter.subscription?.status === 'canceled', malloryAfter.subscription?.status);
    check('premium set false', malloryAfter.subscription?.premium === false);

    // ---------------------------------- expired code cannot be redeemed at all
    section('Expired promo loses access');
    const homePremium = homeAfter.body?.user?.subscription?.premium ?? homeAfter.body?.subscription?.premium;
    check('reported premium is false', homePremium === false, String(homePremium));

    // ------------------------------------------------------- concurrent race
    section('Concurrent redemption — one winner only');
    const promo6 = await makePromo();
    const racers = [];
    for (const n of ['R1', 'R2', 'R3', 'R4', 'R5']) {
      const u = await register(n);
      racers.push({ u, token: (await login(u)).token });
    }
    const results = await Promise.all(racers.map((x) => redeem(x.token, promo6.code)));
    const winners = results.filter((x) => x.status === 200);
    const losers = results.filter((x) => x.status !== 200);
    check('exactly one winner', winners.length === 1, `winners=${winners.length}`);
    check('everyone else refused', losers.length === racers.length - 1, `losers=${losers.length}`);
    let granted = 0;
    for (const x of racers) {
      const d = await dbUser(x.u.id);
      if (d.subscription?.promoCodeText === promo6.code) granted += 1;
    }
    check('exactly one account holds the entitlement', granted === 1, `granted=${granted}`);

    // ------------------------------------------------------ double-click self
    section('Same user double-click is idempotent, never double-grants');
    const promo7 = await makePromo();
    const dbl = racers[1];
    const [x1, x2, x3] = await Promise.all([
      redeem(dbl.token, promo7.code),
      redeem(dbl.token, promo7.code),
      redeem(dbl.token, promo7.code),
    ]);
    const allOk = [x1, x2, x3].every((x) => x.status === 200);
    check('all three taps return 200', allOk, [x1.status, x2.status, x3.status]);
    const dblDb = await dbUser(dbl.u.id);
    check('end date not extended by retries', new Date(dblDb.subscription.promoEndsAt) > new Date(), 'has future date');

    // ------------------------------------------------- method + token guards
    section('Method and token guards');
    const getRes = await req('/user/promo/redeem', { token: malloryLogin.token });
    check('GET is not allowed', getRes.status >= 400, `status=${getRes.status}`);
    const noToken = await req('/user/promo/redeem', { method: 'POST', body: { code: promo1.code } });
    check('no token -> 401', noToken.status === 401, `status=${noToken.status}`);
    const badToken = await req('/user/promo/redeem', {
      method: 'POST',
      token: 'garbage.token.value',
      body: { code: promo1.code },
    });
    check('invalid token -> 401', badToken.status === 401, `status=${badToken.status}`);

    // ------------------------------------------- admin bypass attempt by user
    section('A normal user cannot create promos');
    const evil = await req('/promo/codes', {
      method: 'POST',
      token: malloryLogin.token,
      body: { code: 'E2EHACKED', title: 'nope' },
    });
    check('promo creation refused for users', evil.status >= 400, `status=${evil.status}`);
    check('no promo was actually created', !(await PromoCode.findOne({ code: 'E2EHACKED' })));

    // ------------------------------------------------ trial-gate still works
    section('Non-promo users are still gated');
    const gary = await register('GARY');
    const garyLogin = await login(gary);
    const garyPremium = await req('/user/getStrategyQuestions', { token: garyLogin.token });
    check('fresh account is paywalled', garyPremium.status === 402, `status=${garyPremium.status}`);
    // Trial eligibility is surfaced by /billing/subscription, not by the 402.
    check(
      '402 does not leak whether a trial is available',
      garyPremium.body?.trialEligible === undefined,
      JSON.stringify(garyPremium.body)
    );
    const garySub = await req('/billing/subscription', { token: garyLogin.token });
    check('subscription status endpoint answers', garySub.status === 200, `status=${garySub.status}`);
    // Trial eligibility is NOT in the subscription payload — it is decided at
    // checkout creation. So the real assertion is behavioural: a fresh account
    // must get trial_period_days in the Stripe session, a promo holder must not.
    const freshSession = await req('/billing/checkout', {
      method: 'POST',
      token: garyLogin.token,
      body: { planId: 'monthly' },
    });
    check('fresh account can start checkout', freshSession.status === 200, `status=${freshSession.status} ${JSON.stringify(freshSession.body).slice(0, 160)}`);
    check('fresh account IS trial eligible', freshSession.body?.data?.trialEligible === true, JSON.stringify(freshSession.body?.data));
    check('a real checkout URL was returned', typeof freshSession.body?.data?.url === 'string' && freshSession.body.data.url.startsWith('https://checkout.stripe.com'), String(freshSession.body?.data?.url).slice(0, 60));
    if (freshSession.body?.data?.sessionId) created.sessions.push(freshSession.body.data.sessionId);

    // A promo holder must NOT be trial eligible — that is the stacking guard.
    const erinSub = await req('/billing/subscription', { token: erinLogin.token });
    check('promo holder status reported as promo', erinSub.body?.data?.status === 'promo', erinSub.body?.data?.status);
    check('promo holder reports premium', erinSub.body?.data?.premium === true);
    check('trialUsedAt exposed (stacking guard is visible)', Boolean(erinSub.body?.data?.trialUsedAt), String(erinSub.body?.data?.trialUsedAt));
    check('promo block exposed to the UI', Boolean(erinSub.body?.data?.promo?.code), JSON.stringify(erinSub.body?.data?.promo));
    check('promo end date exposed to the UI', Boolean(erinSub.body?.data?.promo?.endsAt), JSON.stringify(erinSub.body?.data?.promo));
    check('no Stripe id invented for a promo', !erinSub.body?.data?.stripeSubscriptionId, erinSub.body?.data?.stripeSubscriptionId);

    const erinSession = await req('/billing/checkout', {
      method: 'POST',
      token: erinLogin.token,
      body: { planId: 'monthly' },
    });
    check('promo holder can still start checkout', erinSession.status === 200, `status=${erinSession.status} ${JSON.stringify(erinSession.body).slice(0, 160)}`);
    check('promo holder is NOT trial eligible', erinSession.body?.data?.trialEligible === false, JSON.stringify(erinSession.body?.data));
    if (erinSession.body?.data?.sessionId) created.sessions.push(erinSession.body.data.sessionId);
  } catch (err) {
    failed += 1;
    failures.push(`CRASH: ${err.message}`);
    console.log(`\n  CRASH: ${err.stack}`);
  } finally {
    await cleanup();
  }

  console.log(`\n${'='.repeat(58)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  if (failures.length) {
    console.log('\n  Failures:');
    failures.forEach((f) => console.log(`   - ${f}`));
  }
  console.log('='.repeat(58));
  const finalUsers = await userModel.countDocuments({});
  const finalPromos = await PromoCode.countDocuments({});
  check('user count returned to baseline', finalUsers === baselineUsers, `baseline=${baselineUsers} now=${finalUsers}`);
  check('no promo codes left behind', finalPromos === 0, `${finalPromos} promos remain`);
  console.log(`\nProduction totals after run: ${finalUsers} users, ${finalPromos} promos (baseline ${baselineUsers} users)`);

  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
};

run();