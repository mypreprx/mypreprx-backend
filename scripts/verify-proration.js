// Verifies plan-change money behaviour against the DEPLOYED API:
//   upgrade -> proration charged immediately (invoice finalized + paid)
//   downgrade -> no charge, no refund, price switches at renewal
//
//   $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/verify-proration.js

import 'dotenv/config';
import Stripe from 'stripe';
import { webClient } from './_client.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

let subId = null;

const invoicesFor = async (id) =>
  (await stripe.invoices.list({ subscription: id, limit: 20 })).data.sort((a, b) => b.created - a.created);

try {
  await webClient.post('/user/login', { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD });

  const customer = (await stripe.customers.list({ email: process.env.E2E_EMAIL, limit: 1 })).data[0];
  const known = new Set((await stripe.checkout.sessions.list({ limit: 25 })).data.map((s) => s.id));
  await webClient.post('/billing/checkout', { planId: 'monthly' });

  let session = null;
  for (let i = 0; i < 15 && !session; i++) {
    await sleep(1000);
    const fresh = (await stripe.checkout.sessions.list({ limit: 25 })).data.filter((s) => !known.has(s.id));
    session = fresh.sort((a, b) => b.created - a.created)[0] ?? null;
  }
  if (!session) throw new Error('no checkout session created');

  subId = (await stripe.subscriptions.create({
    customer,
    items: [{ price: process.env.STRIPE_PRICE_MONTHLY }],
    trial_period_days: 3,
    metadata: { userId: session.client_reference_id, planId: 'monthly' },
  })).id;

  for (let i = 0; i < 20; i++) {
    const now = (await webClient.get('/billing/subscription')).data?.data;
    if (now?.stripeSubscriptionId === subId) break;
    await sleep(2000);
  }
  check('baseline monthly trial adopted by server', (await webClient.get('/billing/subscription')).data?.data?.stripeSubscriptionId === subId);

  const beforeUpgrade = await invoicesFor(subId);
  const beforeCount = beforeUpgrade.length;

  // ---- UPGRADE --------------------------------------------------------
  const up = await webClient.post('/billing/plan', { planId: 'three-month' });
  check('upgrade accepted', up.status === 200, `HTTP ${up.status}`);

  await sleep(4000);
  const afterUpgrade = await invoicesFor(subId);
  const newInvoices = afterUpgrade.filter((i) => !beforeCount || true).slice(0, 3);
  const proration = newInvoices.find((i) => Number(i.amount_due) !== 0 && Number(i.amount_paid) !== 0);

  const subAfterUp = await stripe.subscriptions.retrieve(subId);
  const items = subAfterUp.items.data;
  check('upgrade switched the Stripe price', items[0].price.id === process.env.STRIPE_PRICE_THREE_MONTH, `price=${items[0].price.id}`);

  if (proration) {
    check('upgrade created an invoice', true, `invoice=${proration.id}`);
    check('proration charged immediately', Number(proration.amount_paid) > 0, `amount_due=${proration.amount_due} amount_paid=${proration.amount_paid} status=${proration.status}`);
    check('invoice is PAID (difference collected now)', proration.status === 'paid', `status=${proration.status}`);
  } else {
    check('upgrade created an invoice', false, `invoices before=${beforeCount} now=${afterUpgrade.length}, amounts=${afterUpgrade.slice(0, 3).map((i) => i.amount_due).join(',')}`);
  }

  // ---- DOWNGRADE ------------------------------------------------------
  const midCount = (await invoicesFor(subId)).length;
  const down = await webClient.post('/billing/plan', { planId: 'monthly' });
  check('downgrade accepted', down.status === 200, `HTTP ${down.status}`);

  await sleep(4000);
  const afterDown = await invoicesFor(subId);
  check('downgrade created NO invoice', afterDown.length === midCount, `invoices ${midCount} -> ${afterDown.length}`);
  check('downgrade made NO refund', afterDown.every((i) => Number(i.amount_refunded) === 0), `refunds=${afterDown.map((i) => i.amount_refunded).join(',')}`);

  const subAfterDown = await stripe.subscriptions.retrieve(subId);
  check('downgrade switched price back', subAfterDown.items.data[0].price.id === process.env.STRIPE_PRICE_MONTHLY, `price=${subAfterDown.items.data[0].price.id}`);
  check('downgrade message cites a renewal date', /scheduled/.test(down.data?.data?.message ?? down.data?.message ?? ''), (down.data?.data?.message ?? down.data?.message ?? '').slice(0, 90));

  const state = (await webClient.get('/billing/subscription')).data?.data;
  check('server planId matches after downgrade', state?.planId === 'monthly', `planId=${state?.planId}`);
} catch (err) {
  check('script completed', false, err.message);
} finally {
  if (subId) {
    await stripe.subscriptions.cancel(subId).catch(() => {});
    console.log(`\nCleaned up ${subId}`);
  }
}

const failed = results.filter((r) => !r).length;
console.log(`\n${'='.repeat(64)}`);
console.log(`  ${results.length - failed}/${results.length} checks passed`);
console.log(failed ? '  PRORATION BEHAVIOUR WRONG' : '  PRORATION BEHAVIOUR CONFIRMED');
console.log('='.repeat(64));
process.exit(failed ? 1 : 0);