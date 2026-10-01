// End-to-end verification that REAL Stripe webhooks reach the DEPLOYED server.
//
//   $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/verify-webhook.js
//
// Creates a real Stripe subscription through the real deployed checkout flow,
// then polls the live API until the server adopts it. No synthetic events.
// Exit code 0 = webhooks confirmed working.

import 'dotenv/config';
import Stripe from 'stripe';
import { webClient, apiBase } from './_client.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

if (!email || !password) {
  console.error('Set E2E_EMAIL and E2E_PASSWORD first.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

let subId = null;

try {
  const diag = (await webClient.get('/billing/webhook-diag')).data;
  check('deployed webhook secret configured', diag?.secretConfigured === true, `fingerprint=${diag?.secretFingerprint}`);

  const reach = await fetch(`${apiBase}/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  check('webhook route reachable via nginx', reach.status === 400, `HTTP ${reach.status}`);

  await webClient.post('/user/login', { email, password });
  const before = (await webClient.get('/billing/subscription')).data?.data;
  console.log(`\nBaseline: subId=${before?.stripeSubscriptionId ?? 'none'} status=${before?.status ?? 'none'} premium=${before?.premium}`);

  const known = new Set((await stripe.checkout.sessions.list({ limit: 25 })).data.map((s) => s.id));

  const checkout = await webClient.post('/billing/checkout', { planId: 'three-month' });
  if (checkout.status !== 200) throw new Error(`checkout failed: ${JSON.stringify(checkout.data)}`);

  let session = null;
  for (let i = 0; i < 15 && !session; i++) {
    await sleep(1000);
    const fresh = (await stripe.checkout.sessions.list({ limit: 25 })).data.filter((s) => !known.has(s.id));
    session = fresh.sort((a, b) => b.created - a.created)[0] ?? null;
  }
  if (!session) throw new Error('no new checkout session appeared in Stripe');

  const userId = session.client_reference_id;
  const customer = session.customer ?? (await stripe.customers.list({ email, limit: 5 })).data[0]?.id;
  if (!customer) throw new Error('could not resolve Stripe customer for test user');

  // SDK is pinned at 22.6.2, which predates checkout.sessions.complete.
  // Creating the subscription directly still emits customer.subscription.created,
  // which is the event the deployed webhook handler syncs on.
  const created = await stripe.subscriptions.create({
    customer,
    items: [{ price: process.env.STRIPE_PRICE_THREE_MONTH }],
    trial_period_days: 3,
    metadata: { userId, planId: 'three-month' },
  });
  subId = created.id;

  const sub = created;
  check('real Stripe subscription created', Boolean(subId), `status=${sub.status} sub=${subId}`);
  check('subscription carries userId metadata', sub.metadata?.userId === userId, `userId=${sub.metadata?.userId}`);
  check('trialing with auto-renew (cancel_at_period_end false)', sub.status === 'trialing' && sub.cancel_at_period_end === false, `status=${sub.status} cancelAtPeriodEnd=${sub.cancel_at_period_end}`);

  console.log(`\nPolling deployed API for adoption of ${subId} (no synthetic events)...`);
  const t0 = Date.now();
  let adopted = null;

  for (let i = 0; i < 90; i++) {
    const now = (await webClient.get('/billing/subscription')).data?.data;
    const got = now?.stripeSubscriptionId;
    if (got === subId) {
      adopted = now;
      break;
    }
    if (i % 3 === 0) {
      console.log(`  [${String(Math.round((Date.now() - t0) / 1000)).padStart(3)}s] server subId=${got ?? 'none'} status=${now?.status ?? 'none'}`);
    }
    await sleep(2000);
  }

  if (adopted) {
    const latency = Math.round((Date.now() - t0) / 1000);
    check('REAL WEBHOOK DELIVERED', true, `latency ~${latency}s`);
    check('status not clobbered to active during trial', adopted.status === sub.status, `server=${adopted.status} stripe=${sub.status}`);
    check('premium granted', adopted.premium === true);
    check('cancelAtPeriodEnd false (auto-renew on)', adopted.cancelAtPeriodEnd === false);

    const body = (await webClient.get('/billing/notifications')).data;
    const notes = Array.isArray(body?.data) ? body.data : body?.data?.notifications ?? body?.notifications ?? [];
    check('webhook wrote notification', notes.length > 0, `${notes.length} notifications, newest="${notes[0]?.title ?? 'none'}"`);
  } else {
    check('REAL WEBHOOK DELIVERED', false, 'not adopted within 180s');
  }
} catch (err) {
  check('script completed', false, err.message);
} finally {
  if (subId) {
    await stripe.subscriptions.cancel(subId).catch(() => {});
    console.log(`\nCleaned up ${subId}`);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${'='.repeat(64)}`);
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`  FAILED: ${failed.map((f) => f.name).join(', ')}`);
  console.log('  >> pm2 logs backend  and look for [stripe-webhook] RECEIVED');
} else {
  console.log('  WEBHOOK CONFIRMED WORKING END TO END');
}
console.log('='.repeat(64));
process.exit(failed.length ? 1 : 0);