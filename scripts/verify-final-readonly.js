// FINAL READ-ONLY VERIFICATION. Creates nothing. No Stripe writes, no logins.
//   node scripts/verify-final-readonly.js

import 'dotenv/config';
import mongoose from 'mongoose';
import userModel from '../Models/userSchema.js';
import notificationModel from '../Models/notificationSchema.js';

const API = 'https://api.mypreprx.com/api';
const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const req = async (path, opts = {}) => {
  try {
    const r = await fetch(`${API}${path}`, { ...opts, signal: AbortSignal.timeout(20000) });
    const t = await r.text();
    return { status: r.status, body: t.slice(0, 200) };
  } catch (e) {
    return { status: 0, body: e.message.slice(0, 60) };
  }
};

console.log('\n=== 1. WEBHOOK EXPOSURE ===');
const unsigned = await req('/stripe/webhook', { method: 'POST', body: '{}' });
check('webhook rejects unsigned POST (400)', unsigned.status === 400, `got ${unsigned.status}`);

const forged = await req('/stripe/webhook', {
  method: 'POST',
  headers: { 'stripe-signature': 't=9999999999,v1=deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef' },
  body: '{}',
});
check('webhook rejects forged signature (400)', forged.status === 400, `got ${forged.status}`);

const junk = await req('/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': 'garbage' }, body: '{}' });
check('webhook rejects malformed signature (400)', junk.status === 400, `got ${junk.status}`);

const getWh = await req('/stripe/webhook');
check('webhook rejects GET (not an open endpoint)', getWh.status !== 200, `got ${getWh.status}`);

const alt1 = await req('/billing/webhook', { method: 'POST', body: '{}' });
const alt2 = await req('/webhooks/stripe', { method: 'POST', body: '{}' });
check('no alternate unsigned webhook paths', alt1.status !== 200 && alt2.status !== 200, `billing=${alt1.status} webhooks=${alt2.status}`);

console.log('\n=== 2. DIAGNOSTIC ENDPOINT ===');
const diag = await req('/billing/webhook-diag');
check('webhook-diag removed (404 after deploy)', diag.status === 404, `currently ${diag.status} — becomes 404 once deployed`);

console.log('\n=== 3. SECRET NOT LEAKED BY ANY ROUTE ===');
const leakPaths = ['/billing/webhook-diag', '/billing/subscription', '/user/Home', '/health', '/'];
let leaked = 0;
for (const p of leakPaths) {
  const r = await req(p);
  if (/whsec_|sk_(live|test)_/.test(r.body)) { leaked++; console.log(`    LEAK at ${p}`); }
}
check('no route body contains whsec_ or sk_ key', leaked === 0, `${leakPaths.length} paths probed`);

console.log('\n=== 4. AUTH GATES (no token) ===');
for (const [p, m] of [
  ['/billing/subscription', 'GET'], ['/billing/checkout', 'POST'], ['/billing/cancel', 'POST'],
  ['/billing/portal', 'POST'], ['/user/Home', 'GET'], ['/billing/notifications', 'GET'],
]) {
  const r = await req(p, { method: m, headers: { 'Content-Type': 'application/json' }, body: m === 'POST' ? '{}' : undefined });
  check(`${p} blocks anonymous`, r.status === 401 || r.status === 403, `got ${r.status}`);
}

console.log('\n=== 5. ROUTE EXISTENCE (401=exists, 404=missing) ===');
for (const p of ['/user/strategy/questions', '/user/getStrategyQuestions']) {
  const r = await req(p);
  console.log(`    ${p} -> ${r.status}`);
}

console.log('\n=== 6. DATABASE INTEGRITY ===');
await mongoose.connect(process.env.MONGODB_URL);

const users = await userModel.find({});
console.log(`  users scanned: ${users.length}`);

const badPremium = users.filter((u) => {
  const st = u.subscription?.status ?? 'none';
  const pr = Boolean(u.subscription?.premium);
  if (st === 'none' || st === 'canceled') return pr;                 // terminal but premium
  if (st === 'suspended') return pr;                                  // suspended but premium
  return !pr && st === 'active';                                      // active but not premium
});
check('no premium/status contradiction', badPremium.length === 0,
  badPremium.map((u) => u.email).join(',') || 'clean');

const suspended = users.filter((u) => u.subscription?.status === 'suspended');
check('no users left suspended', suspended.length === 0, suspended.map((u) => u.email).join(',') || 'none');

const premiumActive = users.filter((u) => {
  const st = u.subscription?.status;
  return ['active', 'trialing', 'past_due'].includes(st) && u.subscription?.premium;
});
console.log(`  users holding premium (expected 0 right now): ${premiumActive.length}`);
premiumActive.forEach((u) => console.log(`    ${u.email} status=${u.subscription.status}`));

const trialers = users.filter((u) => u.subscription?.trialUsedAt && u.subscription?.status !== 'none');
console.log(`  users with a consumed trial latch: ${trialers.length}`);

const testNotifs = await notificationModel.countDocuments({ type: 'billing', createdAt: { $gte: new Date('2026-10-01T00:00:00Z') } });
check('no billing notifications left from testing', testNotifs === 0, `${testNotifs} found`);

const hashed = users.filter((u) => u.subscription?.password || u.subscription?.stripeSecret);
check('no credentials stored inside subscription docs', hashed.length === 0);

await mongoose.disconnect();

const failed = results.filter((r) => !r).length;
console.log(`\n${'='.repeat(62)}`);
console.log(`  ${results.length - failed}/${results.length} read-only checks passed`);
console.log(`  database mutations: 0    stripe api calls: 0`);
console.log('='.repeat(62));