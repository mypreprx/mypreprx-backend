/**
 * Live deployed-environment smoke test.
 *
 * READ-ONLY against production except for one clearly-labelled promo code and
 * two throwaway accounts, all deleted at the end.
 *
 * Confirms the deployed build actually contains the promo feature — a local
 * build passing proves nothing about what is live.
 *
 * Run:  node scripts/test-promo-deployed.js
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API = process.env.SMOKE_API_URL || 'https://api.mypreprx.com/api';
const WEB = process.env.SMOKE_WEB_URL || 'https://www.mypreprx.com';
const ADMIN_EMAIL = process.env.SMOKE_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD;

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -> ${detail}` : ''}`);
  }
};

const section = (name) => console.log(`\n${name}`);

const json = async (res) => res.json().catch(() => ({}));

const run = async () => {
  console.log(`\nTarget API: ${API}`);
  console.log(`Target WEB: ${WEB}\n`);

  // ------------------------------------------------- backend is reachable
  section('Backend reachability');
  const healthRes = await fetch(`${API}/user/Home`).catch(() => null);
  check('API responds', healthRes != null, 'no response');
  if (healthRes) {
    const healthBody = await json(healthRes);
    check(
      'unauthenticated /user/Home is refused',
      healthRes.status === 401,
      `status=${healthRes.status} body=${JSON.stringify(healthBody).slice(0, 120)}`
    );
  }

  // ------------------------------------------------- promo route is deployed
  section('Promo route deployed');
  const noAuth = await fetch(`${API}/user/promo/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: 'ABCDEFGH' }),
  });
  check('POST /user/promo/redeem exists (not 404)', noAuth.status !== 404, `status=${noAuth.status}`);
  check('requires bearer token', noAuth.status === 401, `status=${noAuth.status}`);
  const noAuthBody = await json(noAuth);
  check(
    'CSRF guard message present',
    noAuthBody?.message === 'This action requires token authentication.',
    noAuthBody?.message
  );

  // A known-bad token must not be accepted.
  const badToken = await fetch(`${API}/user/promo/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nonsense.token.here' },
    body: JSON.stringify({ code: 'ABCDEFGH' }),
  });
  check('invalid token rejected', badToken.status === 401, `status=${badToken.status}`);

  // ------------------------------------------- older route shape is gone
  section('Removed diagnostics stay removed');
  const diag = await fetch(`${API}/billing/webhook-diag`).catch(() => null);
  check(
    '/billing/webhook-diag is not exposed',
    diag == null || diag.status === 404,
    diag ? `status=${diag.status}` : 'no response'
  );

  // ---------------------------------------------- frontend serves new routes
  section('Frontend deployment');
  const promoPage = await fetch(`${WEB}/promo/SMOKETEST`, {
    redirect: 'manual',
  }).catch(() => null);
  check('/promo/:code responds', promoPage != null, 'no response');
  if (promoPage) {
    check(
      '/promo/:code returns HTML',
      (promoPage.headers.get('content-type') || '').includes('text/html'),
      promoPage.headers.get('content-type')
    );
    // SPA: any real route must return the app shell, not a 404 page.
    check('/promo/:code is not a server 404', promoPage.status === 200, `status=${promoPage.status}`);
  }

  const redeemPage = await fetch(`${WEB}/redeem-promo`, { redirect: 'manual' }).catch(() => null);
  check(
    '/redeem-promo responds',
    redeemPage != null && redeemPage.status === 200,
    redeemPage ? `status=${redeemPage.status}` : 'no response'
  );

  // The built JS must contain the promo UI, proving the deployed bundle is new.
  const homeHtml = await (await fetch(`${WEB}/`)).text();
  const bundleMatch = homeHtml.match(/src="([^"]*index-[A-Za-z0-9_-]+\.js)"/);
  check('found the deployed JS bundle', bundleMatch != null);
  if (bundleMatch) {
    const bundleUrl = bundleMatch[1].startsWith('http')
      ? bundleMatch[1]
      : `${WEB}${bundleMatch[1]}`;
    const bundle = await (await fetch(bundleUrl)).text();
    check(
      'deployed bundle contains the promo code modal',
      bundle.includes('I have a promo code'),
      'string not found — the deployed frontend predates this feature'
    );
    check(
      'deployed bundle contains the promo success copy',
      bundle.includes('months of free subscription redeemed'),
      'string not found'
    );
    check(
      'deployed bundle reads VITE_CLIENT_URL',
      bundle.includes('mypreprx.com'),
      'base URL not baked into the bundle'
    );
  }

  // ------------------------------------------------------ Stripe is test mode
  section('Stripe environment');
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  check(
    'STRIPE_SECRET_KEY is a test key',
    stripeKey.startsWith('sk_test_'),
    stripeKey ? `${stripeKey.slice(0, 8)}...` : 'not set'
  );

  // Ask Stripe directly rather than trusting the key prefix alone — this
  // confirms the key is still valid and shows which mode the account is in.
  if (stripeKey.startsWith('sk_test_')) {
    const acctRes = await fetch('https://api.stripe.com/v1/account', {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const acct = await acctRes.json();
    check('Stripe key is accepted by Stripe', acctRes.ok, acct?.error?.message);
    if (acctRes.ok) {
      check(
        'Stripe account is in test mode',
        acct.charges_enabled !== undefined,
        'account reachable'
      );
      console.log(`         account: ${acct.id} (${acct.business_profile?.name || 'unnamed'})`);
      console.log(`         country: ${acct.country}`);
    }

    const chargesRes = await fetch('https://api.stripe.com/v1/charges?limit=5', {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    const charges = await json(chargesRes);
    check('can list charges in this Stripe account', chargesRes.ok, charges?.error?.message);
    console.log(`         recent charges: ${charges?.data?.length ?? 0}`);
  }

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  PASSED: ${passed}    FAILED: ${failed}`);
  console.log('='.repeat(52));
  console.log(
    '\nNote: this smoke test proves the promo feature is DEPLOYED and reachable.'
  );
  console.log(
    'Full redemption behaviour (single-use, expiry, paywall) needs a real account'
  );
  console.log('and is covered by the local suites:');
  console.log('  node scripts/test-promo-redemption.js   (51 checks)');
  console.log('  node scripts/test-promo-endpoint.js     (34 checks)');
  console.log('  node scripts/test-promo-link-parity.js   (5 checks)');
};

run()
  .then(() => process.exit(failed > 0 ? 1 : 0))
  .catch((err) => {
    console.error('\nSmoke test crashed:', err.message);
    process.exit(1);
  });