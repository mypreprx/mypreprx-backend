// One-time backfill: latch trialUsedAt for users who already consumed a trial
// before the latch existed. Safe and idempotent — only writes where trialUsedAt is null.
//
//   node scripts/backfill-trial-latch.js          # dry run (read only)
//   node scripts/backfill-trial-latch.js --apply   # write

import 'dotenv/config';
import Stripe from 'stripe';
import mongoose from 'mongoose';
import userModel from '../Models/userSchema.js';

const APPLY = process.argv.includes('--apply');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

await mongoose.connect(process.env.MONGODB_URL);

const users = await userModel.find({ stripeCustomerId: { $exists: true, $nin: [null, ''] } });
console.log(`scanning ${users.length} users with a Stripe customer\n`);

const plan = [];
for (const user of users) {
  const subs = (await stripe.subscriptions.list({
    customer: user.stripeCustomerId,
    status: 'all',
    limit: 100,
  })).data;

  const trialStarts = subs
    .map((s) => s.trial_start)
    .filter((t) => typeof t === 'number' && t > 0);

  const everTrialing =
    trialStarts.length > 0 || subs.some((s) => s.status === 'trialing');

  if (!everTrialing) continue;
  if (user.subscription?.trialUsedAt) continue;

  const earliest = trialStarts.length ? Math.min(...trialStarts) : null;
  plan.push({
    userId: user._id.toString(),
    email: user.email,
    subs: subs.length,
    trialUsedAt: earliest ? new Date(earliest * 1000) : null,
  });
}

console.log('eligible for backfill:');
if (!plan.length) console.log('  (none)');
for (const p of plan) {
  console.log(
    `  ${p.email}  subs=${p.subs}  trialUsedAt=${p.trialUsedAt ? p.trialUsedAt.toISOString() : 'unknown (had trialing status only)'}`
  );
}

if (!APPLY) {
  console.log('\nDRY RUN — nothing written. Re-run with --apply to backfill.');
  await mongoose.disconnect();
  process.exit(0);
}

let written = 0;
for (const p of plan) {
  const res = await userModel.updateOne(
    { _id: p.userId, 'subscription.trialUsedAt': null },
    { $set: { 'subscription.trialUsedAt': p.trialUsedAt ?? new Date() } }
  );
  if (res.modifiedCount) {
    written++;
    console.log(`  wrote ${p.email}`);
  }
}

const remaining = await userModel.countDocuments({
  stripeCustomerId: { $exists: true, $nin: [null, ''] },
  'subscription.trialUsedAt': null,
});

console.log(`\nbackfilled ${written} users`);
console.log(`users with a customer but no trialUsedAt: ${remaining}`);

await mongoose.disconnect();