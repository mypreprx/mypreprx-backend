import 'dotenv/config';
import Stripe from 'stripe';
import { getInvoiceSubscriptionId } from '../Services/billingServices/entitlementService.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const results = [];
const check = (name, pass, detail = '') => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const customer = (await stripe.customers.list({ email: process.env.E2E_EMAIL, limit: 1 })).data[0];
const real = (await stripe.invoices.list({ customer: customer.id, limit: 1 })).data[0];
const realSub = real.parent?.subscription_details?.subscription;
check('real dahlia invoice resolves via parent.subscription_details', getInvoiceSubscriptionId(real) === realSub, `${getInvoiceSubscriptionId(real)}`);

check('legacy string shape still works', getInvoiceSubscriptionId({ subscription: 'sub_legacy1' }) === 'sub_legacy1');
check('legacy object shape still works', getInvoiceSubscriptionId({ subscription: { id: 'sub_legacy2' } }) === 'sub_legacy2');
check('expanded nested object works', getInvoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: 'sub_nested' } } } }) === 'sub_nested');
check('missing field returns null', getInvoiceSubscriptionId({}) === null);
check('null invoice returns null', getInvoiceSubscriptionId(null) === null);

const trialInvoice = real.billing_reason === 'subscription_create' && real.amount_paid === 0;
check('trial-start invoice detected (must NOT force active)', trialInvoice, `billing_reason=${real.billing_reason} amount_paid=${real.amount_paid}`);

console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);