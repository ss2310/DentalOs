# PAYMENTS-HANDOFF — wire Cashfree checkout + webhook

Branch: `vertical-config` · Provider: **Cashfree** (not Razorpay) · Env: sandbox

Read `CLAUDE.md` first. This doc hands off to the next session, whose job is to
**wire real Cashfree payments**. Everything below A2/A3 is already built to make
that a drop-in.

---

## 0. TL;DR — what this session landed (all committed, nothing pushed)

Four commits on `vertical-config` (newest first):

- `d9b069e` **Admin System panel (A3)** — `/admin/system`: health checks, applied-
  migrations registry, feature-flag defaults, admin_audit/billing_events viewer.
- `bbe3ab2` **Admin plan & pack management (A2)** — `/admin/plans`: editable plans +
  packs, price→billing_events logging.
- `39bd22a` **Help chatbot refresh + Hinglish** — structured KB, page-aware, bilingual.
- `20e6fba` **Interactive product tour** — `/tour` marketing demo.

## 1. ⚠️ APPLY THESE MIGRATIONS FIRST (by hand, Supabase SQL editor)

DDL can't run via the service role. Run in order; down-scripts are in
`supabase/rollback/`.

- **`030_plan_pack_admin.sql`** — extends `billing_events.event_type` CHECK
  (adds `plan_price_changed`/`pack_price_changed`) and makes `clinic_id` NULLABLE.
- **`031_system_panel.sql`** — `system_heartbeats` + `record_heartbeat()` (and
  re-points the `subscription-lifecycle` cron to a heartbeat wrapper),
  `applied_migrations` (backfilled 001–031), `feature_flag_defaults`.

Until these run: `/admin/plans` price logging silently no-ops, and `/admin/system`
reads tables that don't exist yet.

**Convention going forward:** every new migration must append its own row to
`applied_migrations` (e.g. the payments migration below adds `('032','...')`).

---

## 2. THE PAYMENT WIRING (next session's task)

### 2.1 What already exists (the seam is ready)
- **Checkout entry:** `startCheckout(kind, id)` in `app/(app)/upgrade/actions.ts`
  → `getBillingProvider(clinic.billing_provider)` → `provider.startCheckout({kind,id})`.
- **Provider interface:** `lib/billing/provider.ts` — `BillingProvider.startCheckout`
  returns `{ pending, message }` OR `{ redirectUrl }`. The `/upgrade` client already
  redirects on `redirectUrl`.
- **Cashfree stub:** `lib/billing/cashfree.ts` (throws today). Register it in
  `getBillingProvider()`'s `case "cashfree"`.
- **Env (in `.env.local`):** `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`,
  `CASHFREE_ENV=sandbox`. PG API base: `https://sandbox.cashfree.com/pg`
  (prod `https://api.cashfree.com/pg`), header `x-api-version: 2023-08-01`,
  auth headers `x-client-id` / `x-client-secret`.
- **Confirm path (reuse, don't reinvent):** `confirm_billing_event(p_event_id, p_actor)`
  — the SAME service-role RPC the admin "Confirm" button calls. It row-locks the
  pending event, flips the clinic to `active` (or applies the pack), grants credits,
  and marks the event `confirmed`. Idempotent (only acts on a `pending` row).
- **/upgrade reads live** from `plans`/`credit_packs` (prices/credits/ `is_active`).
  Nothing is hardcoded. **A2 is the price source of truth.**

### 2.2 Build steps
1. **`cashfreeProvider.startCheckout`** (`lib/billing/cashfree.ts`):
   - Read the **price server-side** from `plans`/`credit_packs` (NEVER trust a
     client amount) — mirror `start_manual_checkout`'s lookup.
   - File a **pending** `billing_events` row for the clinic (plan_id/credit_pack_id,
     amount_inr, provider `'cashfree'`, status `'pending'`) — reuse/extend
     `start_manual_checkout`, or a new definer RPC, so the row exists before the order.
   - Create a Cashfree **order** (`POST /pg/orders`) with `order_amount` = the DB
     price, `order_currency INR`, and an `order_id` you can correlate back to the
     billing_event (see 2.3). Return `{ redirectUrl }` (the `payment_session_id` /
     hosted checkout link).
2. **Webhook** — new route `app/api/webhooks/cashfree/route.ts` (must be **public**;
   add to the middleware public paths like `/audit`, `/p`, `/s`):
   - **Verify the Cashfree signature** (HMAC over the raw body with the secret) before
     trusting anything. Reject on mismatch.
   - On `PAYMENT_SUCCESS`, map the order back to its `billing_events` id and call
     `confirm_billing_event(event_id, null)` with the **service-role** client.
   - Call `record_heartbeat('cashfree_webhook', 'ok', <order/ref>)` (service role) so
     the **A3 System → Health** "Last webhook received" card goes green. On a handled
     failure, `record_heartbeat('cashfree_webhook','error', …)`.
   - Idempotent: `confirm_billing_event` no-ops if already confirmed — safe for
     Cashfree's at-least-once webhook retries.
3. **Route clinics to Cashfree:** set `clinics.billing_provider = 'cashfree'` (the
   column enum already allows it) — flip the default at signup, or per-clinic. Until
   then everyone stays on `'manual'` (admin-confirm), which still works.

### 2.3 Likely need: a correlation column (migration 032)
`billing_events` has no gateway-order column. Either:
- **(a)** set the Cashfree `order_id` = the billing_event UUID (simplest — no schema
  change; the webhook looks up the event by that id), or
- **(b)** add `billing_events.provider_ref text` in migration 032 to store the
  Cashfree order/payment id and index it. **(a) is simpler; prefer it unless you need
  to store Cashfree's own id.** Whichever you pick, **append `('032',…)` to
  `applied_migrations`.**

### 2.4 Smoke tests already in place
- **A3 System → Health** pings the Cashfree sandbox live (green = reachable, amber =
  creds rejected) — a free connectivity/credential check before you build the order call.
- After the webhook lands one payment, the "Last webhook received" card flips green
  and the payment shows in the **A3 audit viewer** (billing source).

### 2.5 Security checklist (CLAUDE.md)
- Cashfree keys are **server-only** (never shipped to client). Order creation +
  webhook run server-side only.
- **Verify the webhook signature**; treat the body as untrusted until then.
- **Amounts come from the DB**, never the client/redirect.
- Multi-tenancy: the pending event is clinic-scoped; `confirm_billing_event` derives
  the clinic from the event row — don't accept a client clinic_id.

---

## 3. Open / optional follow-ups (not blockers)

- **/upgrade lists the ₹0 "Free Trial" plan** as a buyable card (latent). Optional:
  filter `billing_period='trial'` out of the buyable plan list. A2's activation guard
  exempts the trial plan on purpose.
- **Feature-flag-default consumption:** A3 stores + edits global defaults
  (`feature_flag_defaults`) and audits changes, but signup doesn't yet seed a new
  clinic's `feature_flags` from them. ~a few lines when wanted.
- **Verification gap:** the admin UIs (`/admin/plans`, `/admin/system`) and the help
  chat weren't visually driven — they're super-admin/auth-gated and the dev server had
  no session. `tsc` + lint are clean and patterns mirror working admin pages. Recommend
  a quick logged-in smoke test as super-admin.
- **Nothing is pushed** — 4 local commits on `vertical-config`.

## 4. Key files
- Checkout: `app/(app)/upgrade/{actions.ts,upgrade-client.tsx,page.tsx}`
- Providers: `lib/billing/{provider.ts,manual.ts,cashfree.ts}`
- Confirm/credits RPCs: `supabase/migrations/020_credit_engine.sql`
  (`start_manual_checkout`, `confirm_billing_event`, `grant_credits`)
- Heartbeat contract: `supabase/migrations/031_system_panel.sql` (`record_heartbeat`)
- Admin price source: `app/admin/plans/*`
- Health check: `lib/system/health.ts` (Cashfree ping)
