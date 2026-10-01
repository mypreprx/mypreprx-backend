// Tests upgrade proration on a PAID subscription (not mid-trial, where Stripe
// defers proration to the first real invoice and amounts come out 0).
//
//   $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/verify-upgrade-charge.js

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

const ledger = async (id) =>
  (await stripe.invoices.list({ subscription: id, limit: 20 })).data
    .map((i) => ({
      id: i.id,
      reason: i.billing_reason,
      due: Number(i.amount_due),
      paid: Number(i.amount_paid),
      refunded: Number(i.amount_refunded ?? 0),
      status: i.status,
      at: new Date(i.created * 1000).toISOString().slice(11, 19),
    }))
    .sort((a, b) => a.at.localeCompare(b.at));

const dump = async (label, id) => {
  const rows = await ledger(id);
  console.log(`\n  --- invoice ledger (${label}) ---`);
  for (const r of rows) {
    console.log(`    ${r.at}  ${r.status.padEnd(8)} due=${String(r.due).padStart(6)} paid=${String(r.paid).padStart(6)} refunded=${r.refunded}  ${r.reason}`);
  }
  return rows;
};

try {
  await webClient.post('/user/login', { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD });

  const known = new Set((await stripe.checkout.sessions.list({ limit: 25 })).data.map((s) => s.id));
  await webClient.post('/billing/checkout', { planId: 'monthly' });

  let session = null;
  for (let i = 0; i < 15 && !session; i++) {
    await sleep(1000);
    const fresh = (await stripe.checkout.sessions.list({ limit: 25 })).data.filter((s) => !known.has(s.id));
    session = fresh.sort((a, b) => b.created - a.created)[0] ?? null;
  }
  const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;

  const pm = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
await stripe.paymentMethods.attach(pm.id, { customer });

  // No trial: this is a paying customer, which is when proration actually matters.
  const created = await stripe.subscriptions.create({
    customer,
    items: [{ price: process.env.STRIPE_PRICE_MONTHLY }],
    default_payment_method: pm.id,
    payment_behavior: 'default_incomplete',
    metadata: { userId: session.client_reference_id, planId: 'monthly' },
  });
  subId = created.id;

  // Pay the first invoice so the subscription is genuinely active.
  const pending = (await stripe.invoices.list({ subscription: subId, status: 'draft' })).data;
  for (const inv of pending) await stripe.invoices.pay(inv.id).catch(() => {});
  const open = (await stripe.invoices.list({ subscription: subId, limit: 5 })).data.find((i) => i.status === 'open');
  if (open) await stripe.invoices.pay(open.id).catch(() => {});

  let sub = await stripe.subscriptions.retrieve(subId);
  if (sub.status === 'incomplete') {
    const inv = (await stripe.invoices.list({ subscription: subId, limit: 5 })).data.find((i) => i.status === 'open');
    if (inv) await stripe.invoices.pay(inv.id);
    sub = await stripe.subscriptions.retrieve(subId);
  }

  check('paid monthly subscription is active (no trial)', sub.status === 'active', `status=${sub.status}`);

  for (let i = 0; i < 20; i++) {
    if ((await webClient.get('/billing/subscription')).data?.data?.stripeSubscriptionId === subId) break;
    await sleep(2000);
  }

  const before = await dump('after monthly payment', subId);

  // ---- UPGRADE --------------------------------------------------------
  const up = await webClient.post('/billing/plan', { planId: 'three-month' });
  check('upgrade accepted', up.status === 200, `HTTP ${up.status}${up.status !== 200 ? ` ${JSON.stringify(up.data).slice(0, 120)}` : ''}`);
  await sleep(6000);

  const afterUp = await dump('after upgrade to three-month', subId);
  const upSub = await stripe.subscriptions.retrieve(subId);
  check('upgrade switched the Stripe price', upSub.items.data[0].price.id === process.env.STRIPE_PRICE_THREE_MONTH, `price=${upSub.items.data[0].price.id}`);

  const newAfterUp = afterUp.filter((r) => !before.some((b) => b.id === r.id));
  const charge = newAfterUp.find((r) => r.paid > 0);
  check('upgrade created a NEW invoice', newAfterUp.length > 0, `new invoices=${newAfterUp.length} ${newAfterUp.map((r) => `${r.reason}/due=${r.due}/paid=${r.paid}`).join(', ')}`);
  check('upgrade charged the difference immediately', Boolean(charge), charge ? `invoice=${charge.id} paid=${charge.paid} status=${charge.status}` : 'no invoice with paid>0');
  check('proration invoice is PAID now', charge?.status === 'paid', `status=${charge?.status}`);

  const midCount = afterUp.length;

  // ---- DOWNGRADE ------------------------------------------------------
  const down = await webClient.post('/billing/plan', { planId: 'monthly' });
  check('downgrade accepted', down.status === 200, `HTTP ${down.status}`);
  await sleep(6000);

  const afterDown = await dump('after downgrade to monthly', subId);
  const newAfterDown = afterDown.filter((r) => !afterUp.some((a) => a.id === r.id));
  check('downgrade created NO new invoice', newAfterDown.length === 0, `new=${newAfterDown.length} ${newAfterDown.map((r) => `${r.reason}/due=${r.due}`).join(', ')}`);
  check('downgrade made NO refund', afterDown.every((r) => r.refunded === 0), `refunds=${[...new Set(afterDown.map((r) => r.refunded))].join(',')}`);

  const downSub = await stripe.subscriptions.retrieve(subId);
  check('downgrade switched price back', downSub.items.data[0].price.id === process.env.STRIPE_PRICE_MONTHLY, `price=${downSub.items.data[0].price.id}`);
  check('downgrade is deferred to renewal', /scheduled/.test(down.data?.data?.message ?? ''), (down.data?.data?.message ?? '').slice(0, 100));
  check('invoice count unchanged across downgrade', afterDown.length === midCount, `${midCount} -> ${afterDown.length}`);
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
console.log(failed ? '  UPGRADE CHARGE BEHAVIOUR WRONG' : '  UPGRADE CHARGES IMMEDIATELY, DOWNGRADE DEFERS');
console.log('='.repeat(64));
process.exit(failed ? 1 : 0);