/* E2E verification script — run: node scripts/stripeE2E.js */
import 'dotenv/config';
import Stripe from 'stripe';
import mongoose from 'mongoose';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const EXPECTED = {
  STRIPE_PRICE_MONTHLY: { amount: 2999, interval: 'month', recurringCount: 1 },
  STRIPE_PRICE_THREE_MONTH: { amount: 7999, interval: 'month', recurringCount: 3 },
  STRIPE_PRICE_ANNUAL: { amount: 25900, interval: 'year', recurringCount: 1 },
};

const log = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

const signPayload = (payload) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = `${timestamp}.${payload}`;
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET).update(signed).digest('hex');
  return `t=${timestamp},v1=${sig}`;
};

const postWebhook = async (type, object) => {
  const payload = JSON.stringify({ id: `evt_test_${Date.now()}`, object: 'event', type, data: { object } });
  const res = await fetch('http://localhost:4001/api/stripe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signPayload(payload) },
    body: payload,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
};

let allOk = true;

// 1. Stripe auth
try {
  const balance = await stripe.balance.retrieve();
  allOk = log('Stripe auth / test mode', true, `livemode=${balance.livemode}`);
} catch (e) {
  allOk = log('Stripe auth / test mode', false, e.message) && allOk;
}

// 2. Price IDs + amounts
for (const [envKey, exp] of Object.entries(EXPECTED)) {
  const id = process.env[envKey];
  if (!id) { allOk = log(envKey, false, 'missing in .env') && allOk; continue; }
  try {
    const price = await stripe.prices.retrieve(id);
    const recurring = price.recurring;
    const ok =
      price.unit_amount === exp.amount &&
      price.currency === 'usd' &&
      recurring?.interval === exp.interval &&
      (recurring?.interval_count ?? 1) === exp.recurringCount &&
      price.active;
    allOk = log(`${envKey} ($${price.unit_amount / 100}/${recurring?.interval} x${recurring?.interval_count ?? 1})`, ok) && allOk;
  } catch (e) {
    allOk = log(envKey, false, e.message) && allOk;
  }
}

// 3. Webhook endpoints registered
try {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 20 });
  console.log(`\nStripe webhook endpoints (${endpoints.data.length}):`);
  for (const ep of endpoints.data) {
    console.log(`  - ${ep.url}  status=${ep.status}  events=${ep.enabled_events.length}`);
  }
  const hasSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET);
  allOk = log('STRIPE_WEBHOOK_SECRET present', hasSecret) && allOk;
} catch (e) {
  allOk = log('List webhook endpoints', false, e.message) && allOk;
}

// 4. Server up
try {
  const res = await fetch('http://localhost:4001/api/billing/notifications', { method: 'GET' });
  allOk = log('Backend listening on :4001', res.status !== 0, `notifications unauth status=${res.status} (401 expected)`) && allOk;
} catch (e) {
  allOk = log('Backend listening on :4001', false, e.message) && allOk;
}

// 5. DB via mongoose — webhook handler path
if (allOk && process.env.MONGODB_URL) {
  await mongoose.connect(process.env.MONGODB_URL);
  console.log('\nConnected to MongoDB for DB assertions');

  const userModel = (await import('../Models/userSchema.js')).default;
  const notificationModel = (await import('../Models/notificationSchema.js')).default;

  // Fresh test user
  const email = `stripe-e2e-${Date.now()}@test.local`;
  const user = await userModel.create({
    username: `stripe_e2e_${Date.now()}`,
    email,
    password: 'hashed-not-used',
    role: 'user',
  });
  console.log(`Created test user ${user._id} (${email})`);

  const fakeSub = (overrides = {}) => ({
    id: `sub_e2e_${Date.now()}`,
    object: 'subscription',
    customer: `cus_e2e_${Date.now()}`,
    status: 'trialing',
    cancel_at_period_end: false,
    trial_end: Math.floor(Date.now() / 1000) + 3 * 86400,
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    canceled_at: null,
    metadata: { userId: user._id.toString(), planId: 'monthly' },
    items: {
      data: [{
        id: `si_${Date.now()}`,
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        price: { id: process.env.STRIPE_PRICE_MONTHLY, unit_amount: 2999, currency: 'usd' },
      }],
    },
    ...overrides,
  });

  // A. subscription.created → trial entitlement
  {
    const { status, body } = await postWebhook('customer.subscription.created', fakeSub());
    const fresh = await userModel.findById(user._id);
    const ok =
      status === 200 &&
      fresh.subscription?.status === 'trialing' &&
      fresh.subscription?.premium === true &&
      fresh.stripeCustomerId;
    allOk = log('Webhook: subscription.created → trialing + premium', ok, JSON.stringify({ status, body, sub: fresh.subscription && { ...fresh.subscription, _id: undefined } })) && allOk;
  }

  // B. invoice.payment_failed → grace 7d, premium stays, notification
  {
    const before = await userModel.findById(user._id);
    const beforeNotifs = await notificationModel.countDocuments({ user: user._id });
    const invoice = {
      id: `in_fail_${Date.now()}`,
      object: 'invoice',
      customer: before.stripeCustomerId,
      subscription: before.subscription.stripeSubscriptionId,
      billing_reason: 'subscription_cycle',
      status: 'open',
      metadata: { userId: user._id.toString() },
      lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86400 } }] },
      period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    };
    const { status } = await postWebhook('invoice.payment_failed', invoice);
    const fresh = await userModel.findById(user._id);
    const grace = fresh.subscription?.graceEndsAt;
    const graceDays = grace ? (grace - Date.now()) / 86400000 : 0;
    const notifs = await notificationModel.countDocuments({ user: user._id });
    const ok =
      status === 200 &&
      fresh.subscription?.premium === true &&
      fresh.subscription?.status === 'past_due' &&
      grace &&
      graceDays > 6.9 && graceDays < 7.1 &&
      notifs > beforeNotifs;
    allOk = log('Webhook: payment_failed → 7-day grace, still premium, notified', ok, `graceDays=${graceDays.toFixed(2)} status=${fresh.subscription?.status} notifs=${notifs}`) && allOk;
  }

  // C. invoice.payment_succeeded → recovered, grace cleared
  {
    const before = await userModel.findById(user._id);
    const beforeNotifs = await notificationModel.countDocuments({ user: user._id });
    const invoice = {
      id: `in_ok_${Date.now()}`,
      object: 'invoice',
      customer: before.stripeCustomerId,
      subscription: before.subscription.stripeSubscriptionId,
      status: 'paid',
      metadata: { userId: user._id.toString() },
      lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 60 * 86400 } }] },
      period_end: Math.floor(Date.now() / 1000) + 60 * 86400,
    };
    const { status } = await postWebhook('invoice.payment_succeeded', invoice);
    const fresh = await userModel.findById(user._id);
    const notifs = await notificationModel.countDocuments({ user: user._id });
    const paidThrough = fresh.subscription?.paidThrough;
    const ok =
      status === 200 &&
      fresh.subscription?.premium === true &&
      fresh.subscription?.status === 'active' &&
      fresh.subscription?.graceEndsAt === null &&
      paidThrough &&
      notifs > beforeNotifs;
    allOk = log('Webhook: payment_succeeded → active, grace cleared, paid-through set, recovered email', ok, `paidThrough=${paidThrough} status=${fresh.subscription?.status}`) && allOk;
  }

  // D. subscription.updated → plan change to annual
  {
    const before = await userModel.findById(user._id);
    const sub = fakeSub({
      id: before.subscription.stripeSubscriptionId,
      customer: before.stripeCustomerId,
      status: 'active',
      items: { data: [{ id: 'si_chg', current_period_end: Math.floor(Date.now() / 1000) + 365 * 86400, price: { id: process.env.STRIPE_PRICE_ANNUAL } }] },
    });
    const { status } = await postWebhook('customer.subscription.updated', sub);
    const fresh = await userModel.findById(user._id);
    const ok =
      status === 200 &&
      fresh.subscription?.planId === 'annual' &&
      fresh.subscription?.priceId === process.env.STRIPE_PRICE_ANNUAL &&
      fresh.subscription?.premium === true;
    allOk = log('Webhook: subscription.updated → plan synced (annual)', ok, `planId=${fresh.subscription?.planId}`) && allOk;
  }

  // E. payment_failed again → cancel_at_period_end false, then deleted with failure → suspended
  {
    const before = await userModel.findById(user._id);
    // Put into grace first
    await postWebhook('invoice.payment_failed', {
      id: `in_fail2_${Date.now()}`,
      object: 'invoice',
      customer: before.stripeCustomerId,
      subscription: before.subscription.stripeSubscriptionId,
      lines: { data: [] },
      period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    });
    const beforeSuspendNotifs = await notificationModel.countDocuments({ user: user._id, title: 'Subscription suspended' });
    // Dunning ends → canceled while grace active → suspended
    const { status } = await postWebhook('customer.subscription.deleted', fakeSub({
      id: before.subscription.stripeSubscriptionId,
      customer: before.stripeCustomerId,
      status: 'canceled',
      canceled_at: Math.floor(Date.now() / 1000),
    }));
    const fresh = await userModel.findById(user._id);
    const suspendNotifs = await notificationModel.countDocuments({ user: user._id, title: 'Subscription suspended' });
    const ok =
      status === 200 &&
      fresh.subscription?.status === 'suspended' &&
      fresh.subscription?.premium === false &&
      suspendNotifs > beforeSuspendNotifs &&
      (await userModel.findById(user._id)) !== null; // account NOT deleted
    allOk = log('Webhook: dunning-end canceled after failure → suspended + notify, account kept', ok, `status=${fresh.subscription?.status} premium=${fresh.subscription?.premium}`) && allOk;
  }

  // F. user cancel-at-period-end update
  {
    const before = await userModel.findById(user._id);
    const { status } = await postWebhook('customer.subscription.updated', fakeSub({
      id: before.subscription.stripeSubscriptionId,
      customer: before.stripeCustomerId,
      status: 'active',
      cancel_at_period_end: true,
      canceled_at: null,
    }));
    // reset premium for clean cancel test — re-activate first was already suspended; use fresh logic
    const fresh = await userModel.findById(user._id);
    const ok = status === 200 && fresh.subscription?.cancelAtPeriodEnd === true;
    allOk = log('Webhook: cancel_at_period_end sync', ok, `cancelAtPeriodEnd=${fresh.subscription?.cancelAtPeriodEnd}`) && allOk;
  }

  await userModel.deleteOne({ _id: user._id });
  await notificationModel.deleteMany({ user: user._id });
  console.log(`\nCleaned up test user ${user._id}`);

  await mongoose.disconnect();
}

console.log(`\n========== ${allOk ? 'ALL E2E CHECKS PASSED' : 'SOME CHECKS FAILED'} ==========`);
process.exit(allOk ? 0 : 1);
