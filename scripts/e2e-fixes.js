/* Temporary E2E verification for the 17 fixes — not part of the app. */
import 'dotenv/config';
import mongoose from 'mongoose';
import userModel from '../Models/userSchema.js';

const API = 'http://localhost:4001/api';
const STAMP = Date.now();

let pass = 0,
  fail = 0;
const log = (ok, label, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};
const section = (t) => console.log(`\n=== ${t} ===`);

const createdEmails = [];
const mkEmail = (tag) => {
  const e = `e2e.${tag}.${STAMP}@preprx.test`;
  createdEmails.push(e);
  return e;
};

async function apiCall(method, path, { body, token } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Cookie = `Token=${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, body: json };
}

const register = async (tag, extra = {}) => {
  const email = mkEmail(tag);
  const username = `e2e_${tag}_${STAMP}`;
  const password = 'Preprx!Test12345';
  const res = await apiCall('POST', '/user/register', {
    body: { username, email, password, confirmpassword: password, ...extra },
  });
  return { ...res, email, username, password };
};

const login = async (email, password) => {
  const res = await apiCall('POST', '/user/login', { body: { email, password } });
  return { token: res.body?.token, status: res.status };
};

const cleanup = async () => {
  await userModel.deleteMany({ email: { $in: createdEmails } });
};

await mongoose.connect(process.env.MONGODB_URL);
console.log('MongoDB connected\n');

try {
  // ------------------------------------------------------------------ #16
  section('#16 — registration role can never be client-supplied');
  {
    const r = await register('role', { role: 'admin' });
    log(r.status === 201, 'register with role:"admin" succeeds', `status=${r.status}`);
    log(
      r.body?.newUser?.role === 'user',
      'stored/returned role is forced to "user"',
      `returned=${r.body?.newUser?.role}`
    );
    const doc = await userModel.findOne({ email: r.email });
    log(doc?.role === 'user', 'persisted role in Mongo is "user"', `db=${doc?.role}`);

    // a JWT minted with the admin role must not resolve to an admin session
    const l = await login(r.email, r.password);
    const me = await apiCall('GET', '/user/Home', { token: l.token });
    log(me.status === 200, 'JWT with role:user resolves normally', `status=${me.status}`);
  }

  // ------------------------------------------------------------------- #4
  section('#4 — credentials never leave the API');
  {
    const r = await register('creds');
    log(!('password' in (r.body?.newUser || {})), 'register response omits password');
    log(!('sessionToken' in (r.body?.newUser || {})), 'register response omits sessionToken');

    const l = await login(r.email, r.password);
    const me = await apiCall('GET', '/user/Home', { token: l.token });
    log(me.status === 200, 'GET /user/Home reachable', `status=${me.status}`);
    log(!('password' in (me.body?.user || {})), '/user/Home omits password');
    log(!('sessionToken' in (me.body?.user || {})), '/user/Home omits sessionToken');
    log(
      me.body?.user?.subscription !== undefined,
      '/user/Home still returns subscription (paywall needs it)'
    );
  }

  // ------------------------------------------------------------------- #2
  section('#2 — server-side paywall (402 SUBSCRIPTION_REQUIRED)');
  {
    const r = await register('paywall');
    const l = await login(r.email, r.password);
    const t = l.token;

    const home = await apiCall('GET', '/user/Home', { token: t });
    log(home.status === 200, 'open route GET /user/Home works for non-subscriber', `status=${home.status}`);

    const logout = await apiCall('GET', '/user/logout', { token: t });
    log(logout.status !== 402, 'open route GET /user/logout is NOT paywalled', `status=${logout.status}`);

    const prof = await apiCall('PUT', '/user/update-profile', { token: t, body: { bio: 'e2e' } });
    log(prof.status !== 402, 'open route PUT /user/update-profile is NOT paywalled', `status=${prof.status}`);

    // premium routes must be blocked for a non-subscriber
    const premiumCases = [
      ['GET', '/user/getAllTopics', undefined],
      ['GET', '/user/getallPosts', undefined],
      ['GET', '/user/getallNotes', undefined],
      ['GET', '/user/getAllVisualization', undefined],
      ['GET', '/user/behavioral/counts', undefined],
      ['POST', '/user/CreateCustomQuiz', { title: 'x' }],
      ['POST', '/user/DailyFeeling/Check-in', { mood: 'good' }],
      ['GET', '/user/flashcards/get', undefined],
      ['POST', '/user/start-nclex-simulation', { topic: 'x' }],
    ];
    for (const [m, p, b] of premiumCases) {
      const res = await apiCall(m, p, { token: t, body: b });
      log(
        res.status === 402 && res.body?.code === 'SUBSCRIPTION_REQUIRED',
        `${m} ${p} blocked for non-subscriber`,
        `status=${res.status} code=${res.body?.code}`
      );
    }

    // anonymous must be rejected before the paywall check
    const anon = await apiCall('GET', '/user/getAllTopics');
    log(anon.status === 401, 'anonymous premium request rejected 401', `status=${anon.status}`);

    // billing routes must stay reachable so a lapsed user can resubscribe
    for (const [m, p, b] of [
      ['GET', '/billing/subscription', undefined],
      ['POST', '/billing/checkout', { planId: 'monthly' }],
      ['POST', '/billing/portal', undefined],
      ['POST', '/billing/cancel', undefined],
    ]) {
      const res = await apiCall(m, p, { token: t, body: b });
      log(res.status !== 402, `resubscription path ${m} ${p} not paywalled`, `status=${res.status}`);
    }

    // now grant premium and confirm the same routes open up
    await userModel.updateOne({ email: r.email }, { $set: { 'subscription.premium': true, 'subscription.status': 'active' } });
    const opened = await apiCall('GET', '/user/getAllTopics', { token: t });
    log(opened.status !== 402, 'same premium route opens once premium=true', `status=${opened.status}`);

    // and revoking closes it again
    await userModel.updateOne({ email: r.email }, { $set: { 'subscription.premium': false, 'subscription.status': 'suspended' } });
    const closed = await apiCall('GET', '/user/getAllTopics', { token: t });
    log(closed.status === 402, 'premium route re-locks after revocation', `status=${closed.status}`);
  }

  // --------------------------------------------------------------- #1
  section('#1 — server honours PORT (not OAPORT)');
  {
    const probe = await fetch('http://localhost:4001/').catch(() => null);
    log(!!probe, 'server responds on PORT=4001 from .env');
  }
} finally {
  await cleanup();
  await mongoose.disconnect();
}

console.log(`\n${fail === 0 ? 'ALL PASSED' : 'FAILURES'}: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);