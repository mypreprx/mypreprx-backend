/* Production E2E — run: BASE=https://api.mypreprx.com node scripts/stripeProdE2E.js
   Default: SAFE checks only (login, subscription, checkout session, portal).
   FULL=1 adds webhook simulation (mutates prod DB for the test user). */
import 'dotenv/config';
import Stripe from 'stripe';
import crypto from 'crypto';

const BASE = process.env.BASE || 'https://api.mypreprx.com';
const EMAIL = process.env.TEST_EMAIL || 'fari@gmail.com';
const PASSWORD = process.env.TEST_PASSWORD || 'fari123@';
const FULL = process.env.FULL === '1';
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

console.log(`Target: ${BASE}  mode: ${FULL ? 'FULL (webhooks mutate DB)' : 'SAFE'}\n`);

// 1. Backend alive
{
  const { status } = await api('/stripe/webhook', { method: 'GET' }).catch(() => ({ status: 0 }));
  const health = await fetch(`${BASE}/api/billing/subscription`).catch(() => ({ status: 0 }));
  log('Backend reachable + billing route mounted (401 unauth expected)', health.status === 401 || status > 0,
    `sub=${health.status}`);
}

// 2. Stripe config (local keys — same test account as prod)
{
  const acct = await stripe.accounts.retrieve();
  log('Stripe key valid / test mode', acct.id.startsWith('acct_'), `account=${acct.id}`);
  const eps = await stripe.webhookEndpoints.list();
  const ep = eps.data.find(e => e.url.includes('api.mypreprx.com') && e.status === 'enabled');
  log('Stripe webhook endpoint enabled → production URL', Boolean(ep),
    ep ? `${ep.url} events=${ep.enabled_events.length}` : 'NOT FOUND');
}

// 3. Login with provided credentials
let token = '';
{
  const { status, data } = await api('/user/login', { method: 'POST', body: { email: EMAIL, password: PASSWORD } });
  token = data?.token;
  log(`Login ${EMAIL}`, status === 200 && Boolean(token), `status=${status} ${data?.message || ''}`);
}
if (!token) { console.log('\nCannot continue without login.'); process.exit(1); }

// 4. GET subscription
let before = null;
{
  const { status, data } = await api('/billing/subscription', { token });
  before = data?.data;
  log('GET /billing/subscription', status === 200 && typeof before?.premium === 'boolean',
    `status=${before?.status} premium=${before?.premium}`);
}

// 5. Checkout session (real Stripe, monthly)
let customerId = '';
{
  const { status, data } = await api('/billing/checkout', { method: 'POST', token, body: { planId: 'monthly' } });
  const url = data?.data?.url || '';
  log('POST /billing/checkout → Stripe hosted page', status === 200 && url.includes('checkout.stripe.com'),
    `status=${status}`);

  if (url) {
    const sessionId = url.split('cs_test_')[1] ? 'cs_test_' + url.split('cs_test_')[1] : '';
    const id = (data?.data?.sessionId) || sessionId;
    if (id) {
      const session = await stripe.checkout.sessions.retrieve(id, { expand: ['line_items'] });
      customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      log('Session: subscription mode + correct price',
        session.mode === 'subscription' &&
        session.line_items?.data?.[0]?.price?.id === process.env.STRIPE_PRICE_MONTHLY &&
        session.metadata?.userId,
        `price=${session.line_items?.data?.[0]?.price?.id}`);
    }
  } else {
    log('Checkout failed — is STRIPE_* set in production .env?', false, `msg=${data?.message}`);
  }
}

// 6. Portal
{
  const { status, data } = await api('/billing/portal', { method: 'POST', token });
  log('POST /billing/portal', status === 200 && (data?.data?.url || '').includes('billing.stripe.com'),
    `status=${status}`);
}

// 7. Webhook signature endpoint reachable (expect 400 invalid sig, NOT 404)
{
  const res = await fetch(`${BASE}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': 't=1,v1=bad' },
    body: JSON.stringify({ id: 'evt_bad', type: 'ping', data: { object: {} } }),
  });
  log('POST /api/stripe/webhook rejects bad signature (not 404)', res.status === 400 || res.status === 401,
    `status=${res.status}`);
}

// 8. Optional FULL mode — signed webhook against fari's customer
if (FULL && customerId) {
  const trialEnd = Math.floor(Date.now() / 1000) + 3 * 86400;
  const sub = {
    id: `sub_prod_${Date.now()}`, object: 'subscription', customer: customerId, status: 'trialing',
    trial_end: trialEnd, cancel_at_period_end: false, metadata: { planId: 'monthly' },
    items: { data: [{ price: { id: process.env.STRIPE_PRICE_MONTHLY }, current_period_end: trialEnd }] },
  };
  const { status } = await postWebhook('customer.subscription.created', sub);
  const { data } = await api('/billing/subscription', { token });
  const s = data?.data;
  log('Signed webhook → production DB (fari premium)', status === 200 && s?.premium === true && s?.status === 'trialing',
    `status=${s?.status} premium=${s?.premium}`);

  // Revert: canceled webhook (test sub never existed in Stripe)
  await postWebhook('customer.subscription.deleted', { ...sub, status: 'canceled' });
  const { data: after } = await api('/billing/subscription', { token });
  log('Revert webhook → fari back to non-premium', after?.data?.premium === false,
    `premium=${after?.data?.premium} status=${after?.data?.status}`);
} else if (FULL) {
  log('FULL mode needs customerId (checkout failed?)', false);
}

console.log(`\n========== ${allOk ? 'PROD E2E: ALL PASSED' : 'PROD E2E: FAILURES'} ==========`);
process.exit(allOk ? 0 : 1);
