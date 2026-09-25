import Stripe from 'stripe';

let stripeClient = null;

export const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Missing Stripe configuration: STRIPE_SECRET_KEY');
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
};

export const getWebhookSecret = () => {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('Missing Stripe configuration: STRIPE_WEBHOOK_SECRET');
  }
  return process.env.STRIPE_WEBHOOK_SECRET;
};
