// End-to-end verification that REAL Stripe webhooks reach the DEPLOYED server.
// Reads credentials from env — never hardcodes secrets.
//
//   $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/verify-webhook.js
//
// Exits 0 only if a real Stripe subscription is adopted by the deployed server
// WITHOUT any synthetic event being sent.

import 'dotenv/config';
import Stripe from 'stripe';
import { webClient, webUrl, apiBase } from './_client.js';

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
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

let userId = null;
let subId = null;

try {
  // ---- 0. webhook secret diagnostic -------------------------------------
  const diag = await webClient.get('/billing/webhook-diag').catch((e) => ({
    data: { error: e.message },
  }));
  console.log('\n--- /billing/webhook-diag ---');
  console.log(JSON.stringify(diag.data, null, 2));
  console.log('---------------------------\n');
  check(
    'deployed server has STRIPE_WEBHOOK_SECRET set',
    diag.data?.secretConfigured === true,
    `fingerprint=${diag.data?.secretFingerprint ?? 'n/a'} length=${diag.data?.secretLength ?? 0}`
  );

  // ---- 1. confirm the webhook route is reachable from outside ----------
  const reach = await fetch(`${apiBase}/stripe/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  const reachBody = await reach.json().catch(() => ({}));
  check(
    'webhook route reachable through nginx',
    reach.status === 400 && reachBody.message === 'Missing stripe-signature header',
    `HTTP ${reach.status}`
  );

  // ---- 2. login --------------------------------------------------------
  await webClient.post('/user/login', { email, password });
  const baseline = (await webClient.get('/billing/subscription')).data;
  userId = baseline.user?._id ?? baseline.userId;
  console.log(`\nBaseline: subId=${baseline.subscription?.stripeSubscriptionId ?? 'none'} status=${baseline.subscription?.status ?? 'none'}`);

  // ---- 3. create a REAL Stripe subscription via real checkout ---------
  await webClient.post('/billing/checkout', { plan: 'three-month', trial: true });
  const session = (await stripe.checkout.sessions.list({ limit: 10 })).data.find(
    (s) => s.client_reference_id === userId && s.status === 'open'
  );
  if (!session) throw new Error('No open checkout session found');

  await stripe.checkout.sessions.complete(session.id, {
    payment_method: 'pm_card_visa',
  });
  const completed = await stripe.checkout.sessions.retrieve(session.id);
  subId = completed.subscription;

  const sub = await stripe.subscriptions.retrieve(subId);
  check('real Stripe subscription created (trialing)', sub.status === 'trialing', `status=${sub.status} sub=${subId}`);
  check('subscription carries userId metadata', sub.metadata?.userId === userId, `metadata.userId=${sub.metadata?.userId}`);

  // ---- 4. THE TEST: wait for the deployed server to adopt it ----------
  console.log('\nWaiting for deployed server to sync via webhook (no synthetic events)...');
  let adopted = null;
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    const now = (await webClient.get('/billing/subscription')).data;
    const got = now.subscription?.stripeSubscriptionId;
    const t = (i + 1) * 4;
    console.log(`  [${String(t).padStart(3)}s] server subId=${got ?? 'none'} status=${now.subscription?.status ?? 'none'}`);
    if (got === subId) {
      adopted = now;
      break;
    }
  }

  if (adopted) {
    check('REAL WEBHOOK DELIVERED (subId adopted by server)', true, `after ~${20}s`);
    check('status mapped to trialing', adopted.subscription.status === 'trialing', `status=${adopted.subscription.status}`);
    check('premium granted', adopted.subscription.premium === true);
    check('trialUsedAt latched', Boolean(adopted.subscription.trialUsedAt), adopted.subscription.trialUsedAt);
    check('cancelAtPeriodEnd false (auto-renew on)', adopted.subscription.cancelAtPeriodEnd === false);
  } else {
    check('REAL WEBHOOK DELIVERED (subId adopted by server)', false, 'never synced after 120s — see pm2 logs');
  }

  // ---- 5. notifications created by the webhook -------------------------
  const notes = (await webClient.get('/billing/notifications')).data.notifications ?? [];
  const fresh = notes.filter((n) => (n.message ?? '').toLowerCase().includes('trial'));
  check('webhook wrote notification', fresh.length > 0, `${notes.length} total notifications`);
} catch (err) {
  check('script ran without throwing', false, err.message);
} finally {
  // ---- cleanup ---------------------------------------------------------
  if (subId) {
    await stripe.subscriptions.cancel(subId).catch(() => {});
    console.log(`\nCleaned up test subscription ${subId}`);
  }
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${'='.repeat(60)}`);
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`  FAILED: ${failed.map((f) => f.name).join(', ')}`);
  console.log(`  WEBHOOK IS STILL BROKEN — run: pm2 logs backend, then stripe trigger checkout.session.completed`);
} else {
  console.log('  WEBHOOK CONFIRMED WORKING END TO END');
}
console.log('='.repeat(60));
process.exit(failed.length ? 1 : 0);