/**
 * HTTP-layer tests for POST /user/promo/redeem.
 *
 * Boots the real Express app against the real database, then verifies the
 * middleware chain end to end — auth, CSRF guard, rate limit, paywall.
 * Every document created is removed on exit.
 *
 * Run:  node scripts/test-promo-endpoint.js
 */
import express from 'express';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

import userRoutes from '../Routes/userRoutes.js';
import PromoCode from '../Models/promoCodeSchema.js';
import userModel from '../Models/userSchema.js';
import notificationModel from '../Models/notificationSchema.js';

const PORT = 4127;
const BASE = `http://127.0.0.1:${PORT}`;

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

const newUser = async (label, subOverrides = {}) => {
  const stamp = `${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const user = await userModel.create({
    username: `promohttp_${label}_${stamp}`,
    email: `promohttp_${label}_${stamp}@example.invalid`,
    password: 'x'.repeat(60),
    role: 'user',
    subscription: { ...subOverrides },
  });
  createdUsers.push(user._id);
  return user;
};

const newPromo = async (title) => {
  const code = `HT${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const promo = await PromoCode.create({
    title,
    code,
    link: `https://www.mypreprx.com/promo/${code}`,
    qrPayload: `https://www.mypreprx.com/promo/${code}`,
    isActive: true,
  });
  createdPromos.push(promo._id);
  return promo;
};

/** Real login so the test exercises the actual session-token path. */
const loginAs = async (email, password) => {
  const res = await fetch(`${BASE}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, token: body?.token, body };
};

const redeem = async (token, code, extraHeaders = {}) => {
  const res = await fetch(`${BASE}/api/user/promo/redeem`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify({ code }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URL);

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api', userRoutes);
  // Mirrors production ordering: paywall then error handler.
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({ success: false, message: err.message });
  });

  const server = app.listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));

  const plainPassword = 'PromoTest123!';

  try {
    // ---------------------------------------------------------- auth guards
    section('Auth + CSRF guards');

    const noAuth = await redeem(null, 'ABCDEFGH');
    check('no credentials -> 401', noAuth.status === 401, String(noAuth.status));
    check(
      'rejection is the CSRF/bearer message',
      noAuth.body?.message === 'This action requires token authentication.',
      noAuth.body?.message
    );

    const bogus = await redeem('not-a-real-jwt', 'ABCDEFGH');
    check('invalid token -> 401', bogus.status === 401, String(bogus.status));

    const userAuth = await newUser('auth');
    const loginRes = await loginAs(userAuth.email, 'wrong-password');
    check('bad credentials cannot obtain a token', !loginRes.token);

    // -------------------------------------------------- cookie-only rejected
    section('Cookie-only request is rejected (CSRF defence)');
    const cookieUser = await newUser('cookie');
    await newPromo('Cookie CSRF test');
    const promoCookie = createdPromos.length
      ? await PromoCode.findById(createdPromos[createdPromos.length - 1])
      : null;

    const cookieToken = jwt.sign(
      { id: cookieUser._id, email: cookieUser.email, role: cookieUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '3h' }
    );
    cookieUser.sessionToken = cookieToken;
    await cookieUser.save();

    const cookieOnly = await fetch(`${BASE}/api/user/promo/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: `Token=${cookieToken}` },
      body: JSON.stringify({ code: promoCookie.code }),
    });
    check(
      'valid cookie but no Authorization header -> 401',
      cookieOnly.status === 401,
      String(cookieOnly.status)
    );
    const promoCookieAfter = await PromoCode.findById(promoCookie._id);
    check('CSRF attempt did NOT consume the code', promoCookieAfter.redeemedBy === null);

    // ------------------------------------------------------ real user flow
    section('Real user redeems over HTTP');
    const user = await newUser('real', { status: 'none', premium: false });
    // Give the account a usable password for the login call.
    const bcrypt = (await import('bcrypt')).default;
    user.password = await bcrypt.hash(plainPassword, 10);
    await user.save();

    const promo1 = await newPromo('HTTP happy path');
    const goodLogin = await loginAs(user.email, plainPassword);
    check('login succeeds', Boolean(goodLogin.token), goodLogin.body?.message);

    const first = await redeem(goodLogin.token, promo1.code.toLowerCase());
    check('redeem -> 200', first.status === 200, String(first.status));
    check('success flag', first.body?.success === true);
    check('reports 6 months', first.body?.promo?.months === 6, String(first.body?.promo?.months));
    check('returns end date', Boolean(first.body?.promo?.endsAt));

    const afterUser = await userModel.findById(user._id);
    check('status is promo', afterUser.subscription.status === 'promo', afterUser.subscription.status);
    check('premium granted', afterUser.subscription.premium === true);

    // --------------------------------------------- premium access unlocked
    section('Premium access works right after redemption');
    // chooseurGrowthZone is premium-gated; a bogus body is fine, we only care
    // that it is NOT rejected with 402.
    const premiumProbe = await fetch(`${BASE}/api/user/chooseurGrowthZone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${goodLogin.token}` },
      body: JSON.stringify({}),
    });
    check(
      'premium route is NOT paywalled (402) after redemption',
      premiumProbe.status !== 402,
      String(premiumProbe.status)
    );

    // ------------------------------------------------- single use enforced
    section('Single use enforced over HTTP');
    const other = await newUser('other', { status: 'none', premium: false });
    other.password = await bcrypt.hash(plainPassword, 10);
    await other.save();
    const otherLogin = await loginAs(other.email, plainPassword);

    const second = await redeem(otherLogin.token, promo1.code);
    check('second user -> 400', second.status === 400, String(second.status));
    check(
      'generic message (no code enumeration)',
      second.body?.message ===
        'This promo code is invalid, no longer active, or has already been used.',
      second.body?.message
    );
    const otherAfter = await userModel.findById(other._id);
    check('second user got nothing', otherAfter.subscription.premium === false);

    // ------------------------------------------------ idempotent re-submit
    section('Idempotent re-submit by the same user');
    const again = await redeem(goodLogin.token, promo1.code);
    check('repeat submit -> 200 (not an error)', again.status === 200, String(again.status));
    check('flagged as already redeemed', again.body?.promo?.alreadyRedeemed === true);
    const afterUser2 = await userModel.findById(user._id);
    check(
      'end date did not extend',
      String(afterUser2.subscription.promoEndsAt) === String(afterUser.subscription.promoEndsAt)
    );

    // --------------------------------------------------- already subscribed
    section('Already-subscribed user is blocked');
    const promo2 = await newPromo('HTTP subscriber test');
    const subscriber = await newUser('subscriber', { status: 'active', premium: true });
    subscriber.password = await bcrypt.hash(plainPassword, 10);
    await subscriber.save();
    const subLogin = await loginAs(subscriber.email, plainPassword);

    const blocked = await redeem(subLogin.token, promo2.code);
    check('subscriber -> 409', blocked.status === 409, String(blocked.status));
    check('code ALREADY_SUBSCRIBED', blocked.body?.code === 'ALREADY_SUBSCRIBED', blocked.body?.code);
    const promo2After = await PromoCode.findById(promo2._id);
    check('their code was NOT burned', promo2After.redeemedBy === null);

    // ------------------------------------------------------- expiry / paywall
    section('Expired promo loses premium access (paywall)');
    await userModel.updateOne(
      { _id: user._id },
      { $set: { 'subscription.promoEndsAt': new Date(Date.now() - 1000) } }
    );
    const expiredProbe = await fetch(`${BASE}/api/user/chooseurGrowthZone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${goodLogin.token}` },
      body: JSON.stringify({}),
    });
    check('expired promo -> paywalled again (402)', expiredProbe.status === 402, String(expiredProbe.status));

    const subBody = await expiredProbe.json().catch(() => ({}));
    check('402 carries SUBSCRIPTION_REQUIRED', subBody?.code === 'SUBSCRIPTION_REQUIRED', subBody?.code);

    const homeAfterExpiry = await fetch(`${BASE}/api/user/Home`, {
      headers: { Authorization: `Bearer ${goodLogin.token}` },
    });
    const homeBody = await homeAfterExpiry.json().catch(() => ({}));
    check(
      '/user/Home reports premium revoked',
      homeBody?.user?.subscription?.premium === false,
      String(homeBody?.user?.subscription?.premium)
    );
    check(
      '/user/Home reports a non-promo status',
      homeBody?.user?.subscription?.status !== 'promo',
      String(homeBody?.user?.subscription?.status)
    );

    // ------------------------------------------------------------ rate limit
    section('Rate limit');
    const rlUser = await newUser('ratelimit', { status: 'none', premium: false });
    rlUser.password = await bcrypt.hash(plainPassword, 10);
    await rlUser.save();
    const rlLogin = await loginAs(rlUser.email, plainPassword);

    let limited = 0;
    let ok = 0;
    for (let i = 0; i < 15; i += 1) {
      const attempt = await redeem(rlLogin.token, `RL${String(i).padStart(6, 'X')}`);
      if (attempt.status === 429) limited += 1;
      else ok += 1;
    }
    check('repeated attempts eventually get 429', limited > 0, `limited=${limited}`);
    const rlAfter = await userModel.findById(rlUser._id);
    check('rate-limited user gained no access', rlAfter.subscription.premium === false);

    // ------------------------------------------------------------ body abuse
    section('Request body cannot choose the beneficiary');
    const promo3 = await newPromo('HTTP beneficiary test');
    const attacker = await newUser('attacker', { status: 'none', premium: false });
    attacker.password = await bcrypt.hash(plainPassword, 10);
    await attacker.save();
    const victim = await newUser('victim', { status: 'none', premium: false });
    const attLogin = await loginAs(attacker.email, plainPassword);

    const spoof = await fetch(`${BASE}/api/user/promo/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${attLogin.token}` },
      // Try to credit a different account via the body.
      body: JSON.stringify({ code: promo3.code, userId: String(victim._id), id: String(victim._id) }),
    });
    check('spoofed body still redeems for the caller', spoof.status === 200, String(spoof.status));

    const victimAfter = await userModel.findById(victim._id);
    check('victim received NOTHING', victimAfter.subscription.premium === false);
    const attackerAfter = await userModel.findById(attacker._id);
    check('attacker received the promo instead', attackerAfter.subscription.premium === true);

    const promo3After = await PromoCode.findById(promo3._id);
    check('code credited to the attacker', String(promo3After.redeemedBy) === String(attacker._id));

    // ---------------------------------------------------------- GET is closed
    section('Method safety');
    const getAttempt = await fetch(`${BASE}/api/user/promo/redeem`, {
      headers: { Authorization: `Bearer ${attLogin.token}` },
    });
    check('GET on the route is not accepted', getAttempt.status === 404 || getAttempt.status === 405,
      String(getAttempt.status));
  } finally {
    server.close();
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
};

const cleanup = async () => {
  try {
    const ids = createdUsers.map((id) => new mongoose.Types.ObjectId(String(id)));
    if (ids.length) {
      await notificationModel.deleteMany({ user: { $in: ids } });
      await userModel.deleteMany({ _id: { $in: ids } });
    }
    if (createdPromos.length) {
      await PromoCode.deleteMany({ _id: { $in: createdPromos } });
    }
    console.log(`\nCleanup: ${createdUsers.length} users, ${createdPromos.length} promos removed.`);
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
    console.error('\nHTTP test crashed:', err);
    await cleanup();
    await mongoose.disconnect();
    process.exit(1);
  });