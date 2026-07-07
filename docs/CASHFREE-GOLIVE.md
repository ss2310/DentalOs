# Cashfree — Go Live (real payments) checklist

Your code is production-ready (cashfree-pg v6 + cashfree-js v1, signature-verified
webhook, `CFEnvironment.PRODUCTION` switch driven by `CASHFREE_ENV`). Everything
below is **account + config** — no code changes.

There are **5 things**, and payments won't complete until ALL five are done.
The order matters.

---

## 1. Account activation (KYC) — likely already done

Cashfree only enables payment methods after your business KYC is verified. You
said "it enabled a few payment methods" — that means you're activated. Confirm:
**Dashboard → the top toggle reads a real business name, not "Test Mode"**, and
**Payment Gateway → you can switch to the Production environment.** If it still
says "activation pending," finish KYC first (PAN, bank, business docs) — nothing
below works until then.

## 2. Production API keys

Dashboard → **Payment Gateway → Developers → API Keys**, with the environment
toggle set to **Production** (not Test/Sandbox).
- Copy the **App ID** and **Secret Key**.
- ⚠ Sandbox App IDs contain `TEST` — if yours does, you're on the wrong toggle.

## 3. Whitelist your domain (THE usual blocker)

The checkout popup is opened by the browser SDK from `app.themaskedmarketers.com`.
Cashfree **blocks checkout from any domain you haven't whitelisted.**
Dashboard → **Developers → Whitelist / Whitelisted URLs** (naming varies by
account; look under Developers), add:

```
https://app.themaskedmarketers.com
```

(Add the apex `https://themaskedmarketers.com` too if the app is ever served
there.) Save. This is per-environment — make sure you're whitelisting in
**Production**.

## 4. Register the webhook (this is what actually grants credits)

**Fulfillment is webhook-only** — the return page shows a result, but credits
are added ONLY when Cashfree calls your webhook. If this is wrong, the customer
pays and gets nothing.

Dashboard → **Developers → Webhooks → Add endpoint** (Production):

```
https://app.themaskedmarketers.com/api/webhooks/cashfree
```

- Subscribe to **payment success + payment failed / user-dropped** events.
- Pick the **latest webhook version**.
- Hit **Test** — your endpoint answers 200 to a verified ping (it logs it as
  "verified event with no order id"). A 401 there means your keys don't match;
  a 404 means the URL is wrong.

## 5. Vercel env vars (Production) + redeploy

Vercel → your project → **Settings → Environment Variables** (Production scope):

| Variable | Value |
|---|---|
| `CASHFREE_APP_ID` | the **Production** App ID from step 2 |
| `CASHFREE_SECRET_KEY` | the **Production** Secret Key |
| `CASHFREE_ENV` | `production` ← **the footgun: code defaults to sandbox** |
| `NEXT_PUBLIC_APP_URL` | `https://app.themaskedmarketers.com` (no trailing slash) |

Then **Deployments → Redeploy** — env changes don't apply to the running build.

---

## Making the first real payment

1. Cheapest safe test: temporarily set a pack to ₹1 in **/admin/plans**
   (e.g. Map Top-up 10 → ₹1), buy it, then set it back to ₹449. Avoids risking
   a real ₹449. (Or just buy Map 10 at ₹449 — it's fully refundable from the
   Cashfree dashboard afterward.)
2. Buy it from **Plans & Credits** (or "Buy an extra audit" on the Deep Audit
   page). Pay by UPI.
3. Expected, in order:
   - Cashfree hosted checkout opens (if it DOESN'T → domain not whitelisted,
     step 3, or `CASHFREE_ENV` not `production`).
   - You pay → land on `/upgrade/result?order_id=…`.
   - Within seconds the webhook fires → **balance goes up**, a `topup` row
     appears in Settings → Billing, and the payment shows **confirmed** in
     **/admin/payments** with revenue on the admin overview.

## If you pay but credits don't arrive (always the webhook)

Check in this order:
- **Cashfree → Developers → Webhooks → delivery logs**: 401 = key mismatch,
  404 = wrong URL, timeout = broken deploy.
- **Vercel → Logs**, filter `/api/webhooks/cashfree` — look for
  "signature verification failed" or an RPC error.
- The webhook returns 500 on any processing error **on purpose** so Cashfree
  **retries** — and fulfillment is idempotent, so a retry re-applies safely.
  The money-to-credits mapping is never lost (the order id IS the pending row).
- Last resort: the payment sits in **/admin/payments** as pending — confirm it
  by hand from there.

## Notes

- All 5 clinics are now `billing_provider = 'cashfree'` and new signups get it
  by default (fixed 07 Jul) — so the in-app Buy buttons open Cashfree, not the
  old silent "manual" pending order.
- Refund a test payment from the Cashfree dashboard (Payments → Refund). The
  granted credits stay; zero them with an admin adjustment if you want clean
  books.
