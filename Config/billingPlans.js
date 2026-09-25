/**
 * PrepRX subscription plans (source of truth for app-side plan catalog).
 * Stripe Price IDs must be provided via environment variables — never invented here.
 *
 * Required env:
 *   STRIPE_PRICE_MONTHLY
 *   STRIPE_PRICE_THREE_MONTH
 *   STRIPE_PRICE_ANNUAL
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   FRONTEND_URL (or CLIENT_URL) for redirect URLs
 */

export const TRIAL_DAYS = 3;
export const GRACE_PERIOD_DAYS = 7;

export const PLANS = {
  monthly: {
    id: 'monthly',
    title: 'Monthly',
    amount: 2999,
    currency: 'usd',
    priceEnvKey: 'STRIPE_PRICE_MONTHLY',
    interval: 'month',
  },
  'three-month': {
    id: 'three-month',
    title: '3-Month',
    amount: 7999,
    currency: 'usd',
    priceEnvKey: 'STRIPE_PRICE_THREE_MONTH',
    interval: 'month',
    intervalCount: 3,
  },
  annual: {
    id: 'annual',
    title: 'Annual',
    amount: 25900,
    currency: 'usd',
    priceEnvKey: 'STRIPE_PRICE_ANNUAL',
    interval: 'year',
  },
};

export const getPlan = (planId) => {
  const plan = PLANS[planId];
  if (!plan) {
    throw new Error('Invalid plan selected');
  }
  return plan;
};

export const getPlanPriceId = (planId) => {
  const plan = getPlan(planId);
  const priceId = process.env[plan.priceEnvKey];
  if (!priceId) {
    throw new Error(`Missing Stripe price configuration: ${plan.priceEnvKey}`);
  }
  return priceId;
};

export const getPlanIdByPriceId = (priceId) => {
  if (!priceId) return null;
  for (const plan of Object.values(PLANS)) {
    if (process.env[plan.priceEnvKey] === priceId) {
      return plan.id;
    }
  }
  return null;
};

export const getFrontendUrl = () => {
  const url = process.env.FRONTEND_URL || process.env.CLIENT_URL;
  if (!url) {
    throw new Error('Missing FRONTEND_URL configuration');
  }
  return url.replace(/\/$/, '');
};
