// One-shot cleanup of ALL artifacts created during testing.
// Read + delete only. Creates nothing.
//   node scripts/cleanup-test-artifacts.js

import 'dotenv/config';
import Stripe from 'stripe';
import mongoose from 'mongoose';
import userModel from '../Models/userSchema.js';
import notificationModel from '../Models/notificationSchema.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ---- 1. prove we are in test mode ---------------------------------------
const key = process.env.STRIPE_SECRET_KEY || '';
console.log('=== MODE CHECK ===');
console.log('  key prefix           :', key.slice(0, 8));
console.log('  livemode             :', key.startsWith('sk_live') ? 'LIVE  <-- STOP' : 'TEST');
if (!key.startsWith('sk_test_')) {
  console.error('  refusing to run: not a test key');
  process.exit(2);
}

// ---- 2. Stripe: cancel subs, expire sessions, detach cards --------------
const customers = (await stripe.customers.list({ limit: 100 })).data;
console.log(`\n=== STRIPE (test) ===\ncustomers found: ${customers.length}`);

let subsCancelled = 0;
let sessionsExpired = 0;
let pmsDetached = 0;

for (const c of customers) {
  const cid = typeof c === 'string' ? c : c.id;

  for (const s of (await stripe.subscriptions.list({ customer: cid, status: 'all', limit: 100 })).data) {
    if (s.status !== 'canceled') {
      await stripe.subscriptions.cancel(s.id).catch(() => {});
      subsCancelled++;
    }
  }

  for (const s of (await stripe.checkout.sessions.list({ customer: cid, limit: 100 })).data) {
    if (s.status === 'open') {
      await stripe.checkout.sessions.expire(s.id).catch(() => {});
      sessionsExpired++;
    }
  }

  const pms = (await stripe.paymentMethods.list({ customer: cid, type: 'card', limit: 100 })).data;
  for (const pm of pms) {
    await stripe.paymentMethods.detach(pm.id).catch(() => {});
    pmsDetached++;
  }
}

console.log(`  subscriptions cancelled : ${subsCancelled}`);
console.log(`  checkout sessions expired: ${sessionsExpired}`);
console.log(`  payment methods detached: ${pmsDetached}`);

let remaining = { active: 0, trialing: 0, past_due: 0, unpaid: 0, paused: 0 };
for (const c of customers) {
  const cid = typeof c === 'string' ? c : c.id;
  for (const st of Object.keys(remaining)) {
    const list = (await stripe.subscriptions.list({ customer: cid, status: st, limit: 100 })).data;
    remaining[st] += list.length;
  }
}
console.log(`  live subscriptions left : ${JSON.stringify(remaining)}`);

// ---- 3. Mongo: remove test notifications + report user state ------------
console.log('\n=== MONGODB (test artifacts) ===');
await mongoose.connect(process.env.MONGODB_URL);

const CUTOFF = new Date('2026-10-01T00:00:00Z');
const res = await notificationModel.deleteMany({ type: 'billing', createdAt: { $gte: CUTOFF } });
console.log(`  billing notifications deleted (created 2026-10-01+): ${res.deletedCount}`);

const left = await notificationModel.countDocuments({ type: 'billing', createdAt: { $gte: CUTOFF } });
console.log(`  billing notifications remaining from testing: ${left}`);

const users = await userModel.find({ stripeCustomerId: { $exists: true, $nin: [null, ''] } });
console.log(`\n  users holding a Stripe customer: ${users.length}`);
for (const u of users) {
  const s = u.subscription?.toObject?.() ?? u.subscription ?? {};
  console.log(`    ${u.email.padEnd(28)} status=${String(s.status).padEnd(9)} premium=${String(s.premium).padEnd(5)} trialUsedAt=${s.trialUsedAt ? 'set' : 'null'}`);
}

const stale = await userModel.countDocuments({
  'subscription.premium': true,
  'subscription.status': { $in: ['none', 'canceled'] },
});
console.log(`\n  users with premium=true but terminal status: ${stale} (should be 0)`);

await mongoose.disconnect();
console.log('\ncleanup complete');