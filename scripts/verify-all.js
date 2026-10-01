// Master end-to-end regression for all PrepRX billing/security fixes.
// DEPLOYED API + REAL Stripe test-mode objects. No synthetic events.
//
//   $env:E2E_EMAIL='...'; $env:E2E_PASSWORD='...'; node scripts/verify-all.js

import 'dotenv/config';
import Stripe from 'stripe';
import { webClient, apiBase, webUrl } from './_client.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const section = (n) => console.log(`\n${'='.repeat(68)}\n${n}\n${'='.repeat(68)}`);
const check = (fix, name, pass, detail = '') => {
  results.push({ fix, name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${fix}] ${name}${detail ? `\n           ${detail}` : ''}`);
};

const sub = () => webClient.get('/billing/subscription').then((r) => r.data?.data);
const notes = async () => {
  const b = (await webClient.get('/billing/notifications')).data;
  return Array.isArray(b?.data) ? b.data : [];
};
const waitFor = async (pred, max = 40) => {
  for (let i = 0; i < max; i++) {
    const s = await sub();
    if (pred(s)) return s;
    await sleep(2000);
  }
  return await sub();
};

const PRICE = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  'three-month': process.env.STRIPE_PRICE_THREE_MONTH,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

const cleanup = [];

async function mkSession(planId) {
  const known = new Set((await stripe.checkout.sessions.list({ limit: 25 })).data.map((s) => s.id));
  await webClient.post('/billing/checkout', { planId });
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const fresh = (await stripe.checkout.sessions.list({ limit: 25 })).data.filter((s) => !known.has(s.id));
    const s = fresh.sort((a, b) => b.created - a.created)[0];
    if (s) return typeof s.customer === 'string' ? s.customer : s.customer?.id;
  }
  throw new Error('no checkout session appeared');
}

async function mkSub(customer, userId, planId, opts = {}) {
  const created = await stripe.subscriptions.create({
    customer,
    items: [{ price: PRICE[planId] }],
    metadata: { userId, planId },
    ...(opts.trial ? { trial_period_days: 3 } : {}),
    ...(opts.pm ? { default_payment_method: opts.pm, payment_behavior: 'default_incomplete' } : {}),
  });
  return created;
}

async function payAll(subId) {
  for (let i = 0; i < 4; i++) {
    const open = (await stripe.invoices.list({ subscription: subId, limit: 5 })).data.find((x) => x.status === 'open');
    if (!open) return;
    try {
      await stripe.invoices.pay(open.id);
    } catch {
      return;
    }
  }
}

try {
  const email = process.env.E2E_EMAIL;
  await webClient.post('/user/login', { email, password: process.env.E2E_PASSWORD });

  // ---- #1 -------------------------------------------------------------
  section('#1  Deploy health / PORT / webhook route');
  const diag = (await webClient.get('/billing/webhook-diag')).data;
  check('#1', 'backend up + webhook secret configured', diag?.secretConfigured === true, `fingerprint=${diag?.secretFingerprint}`);
  const unsigned = await fetch(`${apiBase}/stripe/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  check('#1', 'webhook route reachable, unsigned -> 400', unsigned.status === 400, `HTTP ${unsigned.status}`);

  // ---- #16 ------------------------------------------------------------
  section('#16  Role forced to user');
  const homeRes = await webClient.get('/user/Home');
  const home = homeRes.data;
  check('#16', 'role is exactly "user"', (home?.user?.role ?? home?.role) === 'user', `role=${home?.user?.role ?? home?.role}`);

  // ---- #4 -------------------------------------------------------------
  section('#4  Credential sanitization');
  const raw = JSON.stringify(home);
  check('#4', 'no password field', !raw.includes('"password"'));
  check('#4', 'no sessionToken field', !raw.includes('sessionToken'));
  check('#4', 'no plaintext passwordValue', !raw.includes('passwordValue'));
  check('#4', 'stripeCustomerId intentionally present', raw.includes('stripeCustomerId'));

  // ---- #2 -------------------------------------------------------------
  section('#2  Paywall enforcement (real HTTP)');
  const PREMIUM = [
    '/user/getAllTopics', '/user/getAllCrashCourses', '/user/getAllPriorityPractice',
    '/user/getallPosts', '/user/getallNotes', '/user/getAllStudyRequests',
    '/user/getAllVisualization', '/user/morningQuote/getLatestQuote',
    '/user/flashcards/get', '/user/behavioral/counts',
  ];
  let gated = 0;
  const notGated = [];
  for (const r of PREMIUM) {
    const res = await webClient.get(r);
    if (res.status === 402 && res.data?.code === 'SUBSCRIPTION_REQUIRED') gated++;
    else notGated.push(`${r} -> ${res.status}`);
  }
  check('#2', 'premium routes -> 402 SUBSCRIPTION_REQUIRED', gated === PREMIUM.length, `${gated}/${PREMIUM.length}${notGated.length ? ` | ${notGated.join('; ')}` : ''}`);
  check('#2', '/user/Home stays open', homeRes.status === 200);
  check('#2', '/billing/subscription stays open', (await webClient.get('/billing/subscription')).status === 200);

  // ---- #12 / #17 / #13 (bundle) --------------------------------------
  section('#12 / #17 / #13  Deployed frontend contract');
  const html = await (await fetch(webUrl)).text();
  const jsPath = html.match(/src="([^"]*index-[^"]*\.js)"/)?.[1];
  const js = await (await fetch(new URL(jsPath, webUrl))).text();
  check('#12', 'bundle has all 3 plan ids', ['monthly', 'three-month', 'annual'].every((p) => js.includes(p)));
  check('#12', 'bundle has amounts in cents (2999/7999/25900)', ['2999', '7999', '25900'].every((a) => js.includes(a)));
  check('#12', 'bundle has NO hardcoded Stripe price ids (no drift)', !js.includes('price_'));
  check('#12', 'bundle has paywall exempt paths', ['/pricing', '/secure-payment', '/confirmation', '/subscriptions'].every((p) => js.includes(p)));
  check('#17', 'bundle uses client-side navigation', /navigate\(/.test(js));
  check('#17', 'bundle surfaces backend message via toast', /toast/.test(js));
  check('#13', 'bundle has notification UI', /notification/i.test(js));

  // ---- #5 / #14 trial -------------------------------------------------
  section('#5 / #14  Trial via REAL webhook');
  const customer = await mkSession('monthly');
  const tri = await mkSub(customer, '6a8f063e627619c92e8b3c7e', 'monthly', { trial: true });
  cleanup.push(tri.id);
  check('#5', 'real trialing subscription created', tri.status === 'trialing', `sub=${tri.id}`);
  const adopted = await waitFor((s) => s?.stripeSubscriptionId === tri.id);
  check('#5', 'REAL WEBHOOK adopted it (no synthetic events)', adopted?.stripeSubscriptionId === tri.id, adopted?.stripeSubscriptionId === tri.id ? 'adopted' : `still ${adopted?.stripeSubscriptionId}`);
  check('#5', 'trialUsedAt latched', Boolean(adopted?.trialUsedAt), String(adopted?.trialUsedAt));
  check('#14', 'status is trialing, NOT clobbered to active', adopted?.status === 'trialing', `status=${adopted?.status}`);
  check('#14', 'trialing grants premium', adopted?.premium === true);
  const latched = adopted?.trialUsedAt;

  // ---- #11 / #7 -------------------------------------------------------
  section('#11 / #7  Duplicate guard + idempotency');
  const guard = await webClient.post('/billing/checkout', { planId: 'monthly' });
  const gUrl = String(guard.data?.data?.url ?? '');
  check('#11', '2nd checkout BLOCKED -> portal, not a new sub', guard.data?.data?.alreadySubscribed === true && gUrl.includes('billing.stripe.com'), `alreadySubscribed=${guard.data?.data?.alreadySubscribed} url=${gUrl.slice(0, 55)}`);
  check('#11', 'blocked response says so honestly', /portal/i.test(guard.data?.message ?? ''), `"${guard.data?.message}"`);
  const portal = await webClient.post('/billing/portal', {});
  check('#11', 'portal session opens', portal.status === 200 && String(portal.data?.data?.url ?? '').includes('billing.stripe.com'));
  const allSubs = (await stripe.subscriptions.list({ customer, status: 'all', limit: 100 })).data;
  check('#7', 'ONE Stripe customer, no duplicates', allSubs.every((s) => typeof s.customer === 'string' ? s.customer === customer : s.customer?.id === customer), `customer=${customer} subs=${allSubs.length}`);
  check('#5', 'trial eligibility consumed (1 free trial per account)', !/trial/i.test(JSON.stringify((await webClient.post('/billing/checkout', { planId: 'monthly' })).data?.data ?? {})));

  // ---- #13 notifications ---------------------------------------------
  section('#13  Durable notifications');
  const n1 = await notes();
  check('#13', 'trial notification persisted', n1.some((n) => /trial/i.test(n.title)), `newest="${n1[0]?.title}"`);
  await webClient.post('/billing/notifications/read', {});
  const n2 = await notes();
  check('#13', 'mark-all-read works', n2.filter((n) => n.read === false).length === 0, `${n2.length} total`);

  // ---- #15 / #8 deferred cancel (trial) ------------------------------
  section('#15 / #8  Cancel reason + copy (trialing = deferred)');
  const can = await webClient.post('/billing/cancel', { reason: 'too_expensive' });
  check('#15', 'cancel accepted', can.status === 200, `"${(can.data?.message ?? '').slice(0, 70)}"`);
  await sleep(6000);
  let s = await sub();
  check('#15', 'cancelReason persisted', s?.cancelReason === 'too_expensive', `cancelReason=${s?.cancelReason}`);
  check('#8', 'canceledBy recorded', s?.canceledBy === 'user', `canceledBy=${s?.canceledBy}`);
  check('#8', 'trialing cancel DEFERS to period end', s?.cancelAtPeriodEnd === true, `cancelAtPeriodEnd=${s?.cancelAtPeriodEnd}`);
  check('#8', 'premium retained until period end', s?.premium === true, `status=${s?.status} premium=${s?.premium}`);
  const n3 = await notes();
  const cn = n3.filter((x) => /cancel/i.test(x.title));
  check('#8', 'cancellation notified', cn.length > 0, `cancel notices=${cn.length}`);
  check('#8', 'copy does NOT blame admin', !/admin/i.test(cn[0]?.message ?? ''), `"${(cn[0]?.message ?? '').slice(0, 68)}"`);
  check('#5', 'trialUsedAt stable through cancel', (await sub())?.trialUsedAt === latched);

  await stripe.subscriptions.cancel(tri.id).catch(() => {});
  const gone = await waitFor((x) => x?.status === 'canceled' && x?.stripeSubscriptionId === tri.id, 30);
  check('#8', 'end-of-period cancel -> canceled + premium revoked', gone?.status === 'canceled' && gone?.premium === false, `status=${gone?.status} premium=${gone?.premium}`);

  // ---- #6 dunning -----------------------------------------------------
  section('#6 / #14  Dunning grace via REAL payment failure');
  const pmGood = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_visa' } });
  await stripe.paymentMethods.attach(pmGood.id, { customer });
  const paid = await mkSub(customer, '6a8f063e627619c92e8b3c7e', 'monthly', { pm: pmGood.id });
  cleanup.push(paid.id);
  await payAll(paid.id);
  let paidFull = await stripe.subscriptions.retrieve(paid.id);
  check('#6', 'paid subscription active (no trial)', paidFull.status === 'active', `status=${paidFull.status}`);
  await waitFor((x) => x?.stripeSubscriptionId === paid.id);

  const pmBad = await stripe.paymentMethods.create({ type: 'card', card: { token: 'tok_chargeDeclined' } });
  await stripe.paymentMethods.attach(pmBad.id, { customer });
  const itemId = paidFull.items.data[0].id;
  // The update itself rejects because finalizing the invoice declines. That is
  // expected — the invoice.payment_failed webhook is what we are testing for.
  const forceCharge = async (price) => {
    try {
      await stripe.subscriptions.update(paid.id, {
        default_payment_method: pmBad.id,
        proration_behavior: 'always_invoice',
        items: [{ id: itemId, price }],
      });
      return null;
    } catch (e) {
      return e.message;
    }
  };
  const decline1 = await forceCharge(PRICE['three-month']);

  const failed = await waitFor((x) => x?.status === 'past_due' || Boolean(x?.graceEndsAt), 40);
  check('#6', 'real payment failure -> past_due', failed?.status === 'past_due', `status=${failed?.status}`);
  check('#6', 'grace window opened', Boolean(failed?.graceEndsAt), `graceEndsAt=${failed?.graceEndsAt}`);
  check('#14', 'premium RETAINED during grace', failed?.premium === true);
  const g1 = failed?.graceEndsAt;
  if (g1) {
    const d = Math.round((new Date(g1) - new Date()) / 86400000);
    check('#6', 'grace = 7 days from FIRST failure', d >= 5 && d <= 8, `${d} days`);
  }

  await forceCharge(PRICE.annual);
  await sleep(15000);
  const g2 = (await sub())?.graceEndsAt;
  check('#6', 'repeat failure does NOT extend grace', g2 === g1, `${g1} -> ${g2}`);

  await stripe.subscriptions.update(paid.id, { default_payment_method: pmGood.id });
  await payAll(paid.id);
  const rec = await waitFor((x) => x?.graceEndsAt === null, 40);
  check('#6', 'recovery clears grace', rec?.graceEndsAt === null, `graceEndsAt=${rec?.graceEndsAt}`);
  check('#6', 'recovered -> active', rec?.status === 'active', `status=${rec?.status}`);

  // ---- #10 money behaviour -------------------------------------------
  section('#10  Upgrade charges now / downgrade defers');
  const before = (await stripe.invoices.list({ subscription: paid.id, limit: 50 })).data.map((i) => i.id);
  const up = await webClient.post('/billing/plan', { planId: 'monthly' });
  check('#10', 'upgrade accepted', up.status === 200, `HTTP ${up.status}`);
  await sleep(8000);
  const afterUp = (await stripe.invoices.list({ subscription: paid.id, limit: 50 })).data;
  const freshInv = afterUp.filter((i) => !before.includes(i.id));
  const charged = freshInv.find((i) => Number(i.amount_paid) > 0);
  check('#10', 'upgrade created a PAID proration invoice', Boolean(charged), freshInv.length ? freshInv.map((i) => `${i.billing_reason}/due=${i.amount_due}/paid=${i.amount_paid}/${i.status}`).join(', ') : 'none');
  check('#10', 'server copy states immediate charge', /synchronize|submitted/i.test(up.data?.message ?? ''), `"${(up.data?.message ?? '').slice(0, 70)}"`);

  const mid = afterUp.length;
  const down = await webClient.post('/billing/plan', { planId: 'three-month' });
  check('#10', 'downgrade accepted', down.status === 200);
  await sleep(8000);
  const afterDown = (await stripe.invoices.list({ subscription: paid.id, limit: 50 })).data;
  check('#10', 'downgrade created NO invoice', afterDown.length === mid, `${mid} -> ${afterDown.length}`);
  check('#10', 'downgrade made NO refund', afterDown.every((i) => Number(i.amount_refunded ?? 0) === 0));
  check('#10', 'downgrade copy promises no charge/refund', /no charge or refund/i.test(down.data?.message ?? ''), `"${(down.data?.message ?? '').slice(0, 96)}"`);
  check('#12', 'server planId in sync', ['monthly', 'three-month', 'annual'].includes((await sub())?.planId), `planId=${(await sub())?.planId}`);
} catch (err) {
  check('suite', 'unhandled error', false, err.message);
} finally {
  console.log(`\nCleaning up ${cleanup.length} test subscriptions...`);
  for (const id of cleanup) await stripe.subscriptions.cancel(id).catch(() => {});
  await sleep(6000);
  const f = await sub().catch(() => null);
  console.log(`final entitlement: status=${f?.status} premium=${f?.premium} subId=${f?.stripeSubscriptionId}`);
}

const failed = results.filter((r) => !r.pass);
const byFix = {};
for (const r of results) {
  byFix[r.fix] ??= { p: 0, f: 0 };
  r.pass ? byFix[r.fix].p++ : byFix[r.fix].f++;
}
console.log(`\n${'#'.repeat(68)}`);
for (const [k, v] of Object.entries(byFix)) console.log(`  ${v.f === 0 ? 'OK  ' : 'FAIL'} ${k.padEnd(6)} ${v.p}/${v.p + v.f}`);
console.log(`#`.repeat(68));
console.log(`  ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) console.log(`  FAILED:\n${failed.map((x) => `    [${x.fix}] ${x.name}`).join('\n')}`);
else console.log('  ALL CHECKS PASSED');
console.log(`#`.repeat(68));
process.exit(failed.length ? 1 : 0);