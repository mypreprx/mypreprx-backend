// Exercises EVERY billing notification email through the real production code
// path (webhook handler -> notificationService -> sendEmail -> Gmail).
//
// Signed synthetic events, so NO Stripe objects are created and NO Stripe API
// is called. Uses a throwaway user so real inboxes stay clean, then deletes it.
//
//   $env:EMAIL_USERNAME='...'; $env:EMAIL_PASSWORD='...'; node scripts/test-notification-emails.js

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';
import userModel from '../Models/userSchema.js';
import notificationModel from '../Models/notificationSchema.js';
import { constructStripeEvent, handleStripeWebhookEvent } from '../Services/billingServices/webhookService.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const MONTHLY = process.env.STRIPE_PRICE_MONTHLY;
const QUARTERLY = process.env.STRIPE_PRICE_THREE_MONTH;
const RECIPIENT = process.env.EMAIL_USERNAME;

const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

const emailErrors = [];
const realErr = console.error;
console.error = (...a) => {
  const s = a.join(' ');
  if (s.includes('Billing email failed')) emailErrors.push(s);
  realErr(...a);
};

let uid = 0;
const fire = async (type, object) => {
  const payload = JSON.stringify({
    id: `evt_notify_${++uid}`,
    object: 'event',
    data: { object },
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null },
  });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  await handleStripeWebhookEvent(constructStripeEvent(Buffer.from(payload), header), null);
};

const DAY = 86400;
const PERIOD_END = Math.floor(Date.now() / 1000) + 30 * DAY;

// price defaults to QUARTERLY so cancellation steps don't also trigger a
// plan-change notification.
const mkSub = (userId, over = {}) => ({
  id: 'sub_notify_test',
  object: 'subscription',
  customer: 'cus_notify_test',
  status: 'active',
  cancel_at_period_end: false,
  trial_end: null,
  canceled_at: null,
  metadata: { userId },
  items: { data: [{ id: 'si_notify_1', current_period_end: PERIOD_END, price: { id: QUARTERLY } }] },
  ...over,
});

const mkInvoice = (userId, over = {}) => ({
  id: 'in_notify_test',
  object: 'invoice',
  customer: 'cus_notify_test',
  amount_paid: 0,
  billing_reason: 'subscription_cycle',
  lines: { data: [{ period: { end: PERIOD_END } }] },
  metadata: { userId },
  ...over,
});

let userId = null;

// Always re-read: the handler loads its own document, so a held instance is stale.
const reload = async () => userModel.findById(userId);
const titlesSoFar = () => notificationModel.countDocuments({ user: userId });
const titlesSince = async (n) =>
  (await notificationModel.find({ user: userId }).sort({ createdAt: 1 }).skip(n)).map((d) => d.title);

/** Fire an event and assert which notification titles it produced. */
const step = async (label, type, object, expect, extra) => {
  const mark = await titlesSoFar();
  await fire(type, object);
  const got = await titlesSince(mark);
  console.log(`\n${label}`);
  for (const want of expect) {
    check(`email: "${want}"`, got.includes(want), got.length ? `sent: ${got.join(' | ')}` : 'nothing sent');
  }
  if (extra) await extra(await reload());
};

try {
  await mongoose.connect(process.env.MONGODB_URL);

  const tmp = await userModel.create({
    username: `notifytest${Date.now()}`,
    email: RECIPIENT,
    password: await bcrypt.hash('throwaway-not-a-real-password', 10),
  });
  userId = tmp._id;
  console.log(`throwaway recipient: ${RECIPIENT} (${userId})\n`);

  await step('1. trial started', 'customer.subscription.created',
    mkSub(userId, { status: 'trialing', trial_end: Math.floor(Date.now() / 1000) + 7 * DAY }),
    ['Free trial started'],
    async (u) => check('  state = trialing', u.subscription.status === 'trialing', u.subscription.status));

  await step('2. payment failed -> grace opens', 'invoice.payment_failed',
    mkInvoice(userId), ['Payment failed'],
    async (u) => {
      check('  state = past_due', u.subscription.status === 'past_due', u.subscription.status);
      check('  premium retained', u.subscription.premium === true, String(u.subscription.premium));
      check('  grace opened', Boolean(u.subscription.graceEndsAt));
      globalThis.__grace1 = String(u.subscription.graceEndsAt);
    });

  await step('3. payment reminder -> grace must NOT extend', 'invoice.payment_failed',
    mkInvoice(userId, { id: 'in_notify_test_2' }), ['Payment reminder'],
    async (u) => check('  grace unchanged', String(u.subscription.graceEndsAt) === globalThis.__grace1,
      `${globalThis.__grace1?.slice(0, 10)} -> ${String(u.subscription.graceEndsAt).slice(0, 10)}`));

  await step('4. payment recovered', 'invoice.paid',
    mkInvoice(userId, { id: 'in_notify_test_3', amount_paid: 2999 }), ['Payment recovered'],
    async (u) => check('  grace cleared', u.subscription.graceEndsAt === null));

  // Step 1 already synced the plan to QUARTERLY, so switching back to MONTHLY
  // is the change that should fire the notification.
  await step('5. plan changed (quarterly -> monthly)', 'customer.subscription.updated',
    mkSub(userId, { items: { data: [{ id: 'si_notify_1', current_period_end: PERIOD_END, price: { id: MONTHLY } }] } }),
    ['Plan updated'],
    async (u) => check('  price applied', u.subscription.priceId === MONTHLY, u.subscription.priceId === MONTHLY ? 'monthly' : String(u.subscription.priceId)));

  await step('6. cancellation scheduled by USER (deferred)', 'customer.subscription.updated',
    mkSub(userId, { cancel_at_period_end: true }), ['Cancellation scheduled'],
    async (u) => check('  canceledBy is not admin', u.subscription.canceledBy !== 'admin', `canceledBy=${u.subscription.canceledBy}`));

  // Grace must already be expired BEFORE the deletion event, otherwise the
  // handler correctly resolves to "canceled" rather than "suspended".
  await userModel.findByIdAndUpdate(userId, {
    'subscription.graceEndsAt': new Date(Date.now() - DAY),
    'subscription.suspendNotifiedAt': null,
  });
  await step('7. suspension after grace expires', 'customer.subscription.deleted',
    mkSub(userId, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }),
    ['Subscription suspended'],
    async (u) => check('  state = suspended', u.subscription.status === 'suspended', u.subscription.status));

  await userModel.findByIdAndUpdate(userId, { 'subscription.graceEndsAt': null, 'subscription.suspendNotifiedAt': null });

  await step('8. canceled immediately by USER', 'customer.subscription.deleted',
    mkSub(userId, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }), ['Subscription canceled'],
    async (u) => check('  premium revoked', u.subscription.premium === false, String(u.subscription.premium)));

  await userModel.findByIdAndUpdate(userId, { 'subscription.canceledBy': 'admin' });
  await step('9. canceled immediately by ADMIN', 'customer.subscription.deleted',
    mkSub(userId, { status: 'canceled', canceled_at: Math.floor(Date.now() / 1000) }),
    ['Subscription canceled by an administrator'],
    async (u) => check('  premium revoked', u.subscription.premium === false, String(u.subscription.premium)));

  const all = await notificationModel.find({ user: userId }).sort({ createdAt: 1 });
  console.log(`\n  total notifications created: ${all.length}`);
  all.forEach((n) => console.log(`    - ${n.title}`));

  console.log('\n--- SMTP health ---');
  check('zero email delivery failures', emailErrors.length === 0,
    emailErrors.length ? emailErrors[0].slice(0, 90) : 'no "Billing email failed" logged');
} catch (err) {
  check('script completed', false, err.message);
  realErr(err);
} finally {
  if (userId) {
    await notificationModel.deleteMany({ user: userId });
    await userModel.deleteOne({ _id: userId });
    console.log('\nCleaned up throwaway user + its notifications');
  }
  await mongoose.disconnect();
  console.error = realErr;
}

const failed = results.filter((r) => !r).length;
console.log(`\n${'='.repeat(62)}`);
console.log(`  ${results.length - failed}/${results.length} checks passed`);
console.log(`  stripe objects created: 0    stripe api calls: 0`);
console.log(`  emails sent to ${RECIPIENT}`);
console.log('='.repeat(62));