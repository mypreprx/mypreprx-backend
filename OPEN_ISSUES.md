# Open Issues — PrepRX Billing

## Status as of 2026-10-01. Production billing flow is verified at the API level
(39/40 master suite, 12/12 upgrade/downgrade money behaviour, 10/10 paywall
routes) against real Stripe test objects and real signed webhooks. All 10
notification emails confirmed delivered. The read-only audit is 17/17 and the
temporary webhook diagnostic endpoint is removed.

The four items below are **unverified, not unfixed**. Nothing here blocks deploy.

## 1. Real card decline → `invoice.payment_failed` delivery  [HIGHEST VALUE]

The grace-window handler is proven: signed events against the live server
confirmed a 7-day window measured from the *first* failure, that repeat
failures do not extend it, and that recovery clears it.

What has **never** been observed is Stripe actually declining a charge and
delivering `invoice.payment_failed` to the endpoint.

Blocked on Stripe validating cards on attach — a declining card can never be
attached. Five approaches failed:

- `paymentMethods.attach` with `tok_chargeDeclined` -> "Your card was declined."
- `paymentMethods.create({ customer })` -> cannot attach during creation
- raw card numbers (`4000000000000002`) -> rejected as unsafe
- `paymentMethods.update` -> `card[token]` / `number` / `cvc` all rejected
- pinned older API versions (2020-08-27, 2019-12-03) -> still validates

`invoice.payment_succeeded` delivery *is* proven working, and the event is
enabled on the endpoint, so delivery risk is low. To close it properly, use a
**Stripe test clock**: create a clock + customer + good card, subscribe, then
advance the clock past renewal to force a genuine failure.

## 2. Admin endpoints (#3 credential projection, #9 immediate cancellation)

Implemented, untested — no admin account available. Owner is testing manually
by adding a `4242 4242 4242 4242` subscription for a user and admin-cancelling
it. Confirm: admin list responses carry no password/token, and that immediate
cancellation ends access now while user cancellation defers to period end.

## 3. Outbound email delivery — ✅ VERIFIED 2026-10-01

Root cause of the earlier `Missing credentials for "PLAIN"` failure: `.env` had
**no `EMAIL_*` keys at all**, so `sendEmail.js` had no credentials.

All 10 billing templates now confirmed delivered through the real code path
(webhook handler → notificationService → sendEmail → Gmail), 21/21 checks,
zero Stripe objects created:

- Free trial started
- Payment failed (grace opens, premium retained)
- Payment reminder (grace **not** extended — deadline held fixed)
- Payment recovered (grace cleared)
- Plan updated
- Cancellation scheduled — user wording
- Subscription suspended
- Subscription canceled — user wording
- Subscription canceled **by an administrator** — distinct wording

Re-run anytime: `node scripts/test-notification-emails.js`
(needs `EMAIL_USERNAME` / `EMAIL_PASSWORD` in the environment).

### ⚠️ ACTION REQUIRED ON THE SERVER

Local `.env` is updated and confirmed working (auth + real send, verified with
the shell environment cleared). The **deployed** server has never had these set,
so production email is still broken. Add to `/var/www/preprx/.env` on the server:

```
EMAIL_USERNAME=fstechny@gmail.com
EMAIL_PASSWORD="<gmail app password>"
```

Quote the password — it contains spaces. Then:

```
pm2 restart all --update-env
```

Re-test after deploying with `node scripts/test-smtp.js`.

## 4. Browser / UI interaction

Every test so far was API-level via Node. Never opened a browser. Untested:
notification bell render + mark-all-read, paywall redirect, upgrade page
navigation and toast, and cancel flow.

---

# Known pre-existing issues (out of scope, untouched)

- **Strategy route mismatch.** `frontend/src/pages/strategy_zone/components/StrategyDrill.jsx:59`
  calls `/user/strategy/questions` -> **404**. Backend only exposes
  `/user/getStrategyQuestions` (`Routes/userRoutes.js`, behind premium auth).
  Confirmed pre-existing: no billing work touched user or strategy routes.
- **83 frontend lint problems.** Changed files were lint-clean.
- **Stripe SDK pinned at 22.6.2** against API `2026-08-26.dahlia`. Safe for
  every call currently in use (`customers.create`, `subscriptions.list/
  retrieve/update/cancel`, `billingPortal.sessions.create`,
  `checkout.sessions.create`, `webhooks.constructEvent` — all exercised
  successfully). `customers.list` throws a parse error under this pairing and
  is **not used in production**. Will break again on the next Stripe field
  migration — the exact class of bug fixed here — so upgrade deliberately.

# Housekeeping

- Rotate the test-account password (`fari@gmail.com`); it is exposed in prior
  session transcripts.