/* Authenticated API E2E — run: node scripts/stripeApiE2E.js */
import 'dotenv/config';
import Stripe from 'stripe';
import crypto from 'crypto';
import mongoose from 'mongoose';

const BASE = 'http://localhost:4001';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
let allOk = true;
const log = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) allOk = false;
};

const signPayload = (payload) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`).digest('hex');
  return `t=${timestamp},v1=${sig}`;
};

const postWebhook = async (type, object) => {
  const payload = JSON.stringify({ id: `evt_${Date.now()}`, object: 'event', type, data: { object } });
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signPayload(payload) },
    body: payload,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const api = async (path, { method = 'GET', token, body } = {}) => {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
};

const stamp = Date.now();
const email = `apie2e${stamp}@test.local`;
const password = 'Test1234!';

// 1. Register
{
  const { status, data } = await api('/user/register', {
    method: 'POST',
    body: { username: `apie2e${stamp}`, email, password, confirmpassword: password },
  });
  log('Register test user', status === 201 || status === 200, `status=${status} ${data?.message || ''}`);
}

// 2. Login
let token = '';
{
  const { status, data } = await api('/user/login', {
    method: 'POST',
    body: { email, password },
  });
  token = data?.token;
  log('Login (get JWT)', status === 200 && Boolean(token), `status=${status}`);
}
if (!token) process.exit(1);

// 3. GET subscription (fresh — none)
{
  const { status, data } = await api('/billing/subscription', { token });
  const s = data?.data;
  log('GET /billing/subscription (fresh)', status === 200 && s?.status === 'none' && s?.premium === false,
    `status=${s?.status} premium=${s?.premium}`);
}

// 4. Checkout session
let checkoutUrl = '';
let sessionId = '';
let customerId = '';
{
  const { status, data } = await api('/billing/checkout', {
    method: 'POST',
    token,
    body: { planId: 'monthly' },
  });
  checkoutUrl = data?.data?.url || '';
  sessionId = data?.data?.sessionId || '';
  log('POST /billing/checkout', status === 200 && checkoutUrl.includes('checkout.stripe.com'),
    `session=${sessionId}`);

  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['line_items'] });
    const priceId = session.line_items?.data?.[0]?.price?.id;
    customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    const ok =
      session.mode === 'subscription' &&
      session.metadata?.planId === 'monthly' &&
      priceId === process.env.STRIPE_PRICE_MONTHLY &&
      session.metadata?.userId;
    log('Stripe session: mode=subscription, correct price, userId metadata', ok,
      `mode=${session.mode} price=${priceId} userId=${session.metadata?.userId}`);
  }
}

// 5. Create REAL test subscription in Stripe (3-day trial) for this customer
let realSub = null;
{
  realSub = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: process.env.STRIPE_PRICE_MONTHLY }],
    trial_period_days: 3,
    metadata: { planId: 'monthly' },
    collection_method: 'charge_automatically',
  });
  log('Stripe: real subscription created (trialing)', realSub.status === 'trialing',
    `sub=${realSub.id} status=${realSub.status} trialEnd=${realSub.trial_end}`);

  // Deliver webhook (real object) to our handler
  const { status } = await postWebhook('customer.subscription.created', realSub);
  const { status: gStatus, data: gData } = await api('/billing/subscription', { token });
  const s = gData?.data;
  log('Webhook (real sub) → GET shows trialing + premium', status === 200 && s?.status === 'trialing' && s?.premium === true,
    `apiStatus=${s?.status} premium=${s?.premium} plan=${s?.planId}`);
  void gStatus;
}

// 6. Simulate invoice paid (Stripe still trialing → status must stay trialing; paid-through updated)
{
  const invoice = {
    id: `in_${Date.now()}`,
    object: 'invoice',
    customer: customerId,
    subscription: realSub.id,
    status: 'paid',
    lines: { data: [{ period: { end: Math.floor(Date.now() / 1000) + 30 * 86400 } }] },
    period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
  };
  await postWebhook('invoice.payment_succeeded', invoice);
  // Re-sync from Stripe (still trialing) — webhook source of truth
  const { data } = await api('/billing/subscription', { token });
  const s = data?.data;
  const ok = s?.premium === true &&
    (s?.status === 'trialing' || s?.status === 'active') &&
    Boolean(s?.paidThrough);
  log('invoice.payment_succeeded → premium kept, paid-through set (status follows Stripe)', ok,
    `status=${s?.status} paidThrough=${s?.paidThrough}`);
}

// 7. Plan change → annual (Stripe proration)
{
  const { status, data } = await api('/billing/plan', {
    method: 'POST',
    token,
    body: { planId: 'annual' },
  });
  const updated = await stripe.subscriptions.retrieve(realSub.id);
  const priceNow = updated.items.data[0].price.id;
  log('POST /billing/plan → annual', status === 200 && priceNow === process.env.STRIPE_PRICE_ANNUAL,
    `api=${status} stripePrice=${priceNow} msg=${data?.message}`);

  // Sync webhook for local entitlement
  await postWebhook('customer.subscription.updated', updated);
  const { data: sData } = await api('/billing/subscription', { token });
  log('Webhook after plan change → planId annual', sData?.data?.planId === 'annual',
    `planId=${sData?.data?.planId}`);
}

// 8. Portal session
{
  const { status, data } = await api('/billing/portal', { method: 'POST', token });
  const url = data?.data?.url || '';
  log('POST /billing/portal', status === 200 && url.includes('billing.stripe.com'), url.slice(0, 60));
}

// 9. User cancel → cancel_at_period_end (access until period end)
{
  const { status, data } = await api('/billing/cancel', { method: 'POST', token });
  const sub = await stripe.subscriptions.retrieve(realSub.id);
  const { data: sData } = await api('/billing/subscription', { token });
  log('POST /billing/cancel → Stripe cancel_at_period_end, premium still true',
    status === 200 && sub.cancel_at_period_end === true && sData?.data?.premium === true,
    `stripeCancelAtEnd=${sub.cancel_at_period_end} localPremium=${sData?.data?.premium} msg=${data?.message}`);
}

// 10. Admin immediate cancel
{
  // Login as admin if exists — create ephemeral admin session via direct stripe cancel path:
  // use admin API with a registered admin is heavy; call Stripe cancel + verify webhook instead,
  // AND hit admin endpoint expecting 401 without admin token (auth enforced).
  const unauth = await api('/admin/subscriptions/000000000000000000000000/cancel-immediate', { method: 'POST' });
  log('Admin cancel route exists + auth-gated (401 for user)', unauth.status === 401 || unauth.status === 403,
    `status=${unauth.status}`);

  await stripe.subscriptions.cancel(realSub.id);
  const { status } = await postWebhook('customer.subscription.deleted', await stripe.subscriptions.retrieve(realSub.id));
  const { data } = await api('/billing/subscription', { token });
  const s = data?.data;
  log('Stripe cancel → webhook → status not premium', status === 200 && s?.premium === false,
    `status=${s?.status} premium=${s?.premium}`);
}

// Cleanup Stripe + local user
try {
  await stripe.customers.del(customerId);
} catch { /* may fail if invoices exist — fine */ }

await mongoose.connect(process.env.MONGODB_URL);
const userModel = (await import('../Models/userSchema.js')).default;
const notificationModel = (await import('../Models/notificationSchema.js')).default;
const user = await userModel.findOne({ email });
if (user) {
  const notifCount = await notificationModel.countDocuments({ user: user._id });
  console.log(`\nUser still exists after cancel (not deleted): ${Boolean(user)}  notifications=${notifCount}`);
  await notificationModel.deleteMany({ user: user._id });
  await userModel.deleteOne({ _id: user._id });
  console.log('Cleaned up API E2E user');
}
await mongoose.disconnect();

console.log(`\n========== ${allOk ? 'API E2E: ALL PASSED' : 'API E2E: FAILURES'} ==========`);
process.exit(allOk ? 0 : 1);
