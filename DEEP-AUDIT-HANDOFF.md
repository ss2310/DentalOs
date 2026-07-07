# HANDOFF — Payments complete → Deep Audit module next

Branch: `vertical-config` · Provider: **Cashfree** (sandbox) · Read `CLAUDE.md` first.

This doc closes out the **payments** work (checkout + webhook + payment links, all
built & committed this session) and tees up the **Deep Audit module** the next
session will build. Nothing is pushed — all commits are local on `vertical-config`.

---

## 0. TL;DR — state of the tree

Recent commits (newest first):

- `843e133` **admin payment links + payment visibility** (C3)
- `13f97e5` **cashfree webhook: auto-apply plans and credits** (C2)
- `5bcf286` **cashfree checkout adapter** (C1)
- `3046de2` Add payments handoff (inbound doc for this session)

Working tree is **clean**. `tsc --noEmit` and `next lint` are green across all
changed files.

### ⚠️ Migrations to apply by hand (Supabase SQL editor), in order
DDL can't run via the service role. After each, run `notify pgrst, 'reload schema';`
(PostgREST caches schema; skipping this is why RPCs 404 as "not found in cache").

- **`032_cashfree_checkout.sql`** — `pending_payments` table + `start_cashfree_checkout` + routes clinics to `cashfree`.  ✅ applied
- **`033_cashfree_webhook.sql`** — `confirm_cashfree_payment`, `invoices`, shared confirmation cores.  ✅ applied
- **`034_payment_links.sql`** — payment links, `paid_at`, `admin_payments_feed`, extends `confirm_cashfree_payment` (adds `p_cf_link_id`) + `admin_overview_stats`.  ✅ applied

All three are applied on the current dev Supabase project. **A fresh
deployment/project must re-apply 032–034** (and 030/031 before them). Convention:
every migration appends its own row to `applied_migrations` (next is `035`).

---

## 1. What the payments system does now (so you don't relearn it)

**The one seam:** `getBillingProvider(clinics.billing_provider)` in
`lib/billing/provider.ts`. Live providers: `cashfree` (default) + `manual`
(admin escape hatch).

- **Checkout** (`/upgrade`): `startCheckout` → `start_cashfree_checkout` files a
  `pending_payments` row (`source='checkout'`, `order_id = pending_payments.id`) →
  `PGCreateOrder` → browser launches Cashfree JS with `payment_session_id` →
  returns to `/upgrade/result` (display-only poller). Key files:
  `lib/billing/cashfree.ts`, `app/(app)/upgrade/*`.
- **Payment links** (admin `/admin/clinics/[id]` → "Send payment link"):
  `sendPaymentLink` → `admin_start_payment_link` (row `source='payment_link'`) →
  `createCashfreePaymentLink` (`link_id = pending_payments.id`, +7d expiry) →
  `admin_finalize_payment_link` stores `cf_link_id`. Returns the URL + a **wa.me**
  Hinglish deep link to the owner. Files: `app/admin/clinics/actions.ts`,
  `app/admin/clinics/[id]/admin-actions.tsx`.
- **Webhook** (`app/api/webhooks/cashfree/route.ts`, PUBLIC — see middleware
  public paths): verifies the signature over the RAW body via
  `PGVerifyWebhookSignature`, then `confirm_cashfree_payment(...)`.
  - **Mapping:** checkout → by `order_id`; link → by `order_tags.cf_link_id`
    (Cashfree injects it; we stored it at send time).
  - **Idempotent:** row-locked `created/failed → paid` flip guarded by
    `status <> 'paid'`. Returns 200 on success/dupe/ignore; **500 only on an
    unexpected error** so Cashfree retries (safe — idempotent).
  - Fulfillment = shared cores `apply_plan_purchase` / `apply_pack_purchase`
    (the SAME logic admin "Mark as Paid" + manual-confirm use) + a
    `billing_events` row + an **invoice** (`GOS-YYYY-NNNN`) + a clinic
    notification. Heartbeat `record_heartbeat('cashfree_webhook', …)` feeds the
    A3 System → Health card.
- **Visibility:** `/admin/payments` money feed (status filter), `/admin` overview
  cards (revenue this month, pending links), and per-clinic Payments/Invoices
  history on the clinic detail page.

**Security invariants (keep them):** Cashfree keys server-only; **amounts always
from the DB** (never client); clinic derived server-side (never a client
`clinic_id`); webhook signature-gated before trusting the body; `pending_payments`
/ `invoices` are clinic-read-only with no client writes; every admin action is
`requireAdminContext` + `writeAudit`.

---

## 2. Payment ops — how to test / go live (learned the hard way this session)

- **Local webhooks need a public URL.** We used a Cloudflare quick tunnel
  (`cloudflared.exe` in the scratchpad): `cloudflared tunnel --url http://localhost:3000`.
  **Its URL changes on every restart** and has no uptime guarantee — a stale URL
  in the Cashfree dashboard silently drops payments (this bit us: a paid link sat
  as "due" because the webhook went to a dead URL).
- **Recommended path to "live":** deploy to Vercel (preview or prod), set the
  `CASHFREE_*` + `NEXT_PUBLIC_APP_URL` env there, register **that** stable URL in
  the Cashfree dashboard (Developers → Webhooks; enable Payment Success/Failed/
  User Dropped — links use the same events). Then swap sandbox→prod keys when ready.
- **Recovery for a lost webhook** (pattern, if it happens again): verify the
  payment is real via the SDK (`PGFetchLink` / `PGOrderFetchPayments`), then call
  `confirm_cashfree_payment` with the real `cf_payment_id` using the service role.
  It's idempotent. (Used once this session to recover invoice `GOS-2026-0004`.)
- **Known loose ends (non-blocking):**
  - `/upgrade` still lists the ₹0 "Free Trial" plan as buyable (the price guard
    blocks ordering it; optionally filter `billing_period='trial'` out of the list).
  - Payment-link `return_url` is intentionally omitted (owner may be logged out;
    fulfillment is webhook-driven) — Cashfree shows its default success page.
  - One sandbox test link (`36ba1d1c…`) is still ACTIVE/unpaid; let it expire.

---

## 3. NEXT: the Deep Audit module

**Goal (as understood):** a deeper clinic online-presence audit that extends the
existing **prospect audit**. New API keys were just added to `.env.local`, clearly
staged for this and **not yet referenced in any code**:

- `GOOGLE_MAPS_API_KEY` — Places/GMB data (profile completeness, reviews, photos).
- `PAGESPEED_API_KEY` — PageSpeed Insights (site performance / Core Web Vitals / SEO).
- `GEMINI_API_KEY`, `OPENROUTER_API_KEY` — additional LLM routes (audit synthesis /
  recommendations). Note: per CLAUDE.md the primary content model is Claude via a
  **server-side route only**; decide deliberately where Gemini/OpenRouter fit and
  keep every key server-side.

### What already exists to build on (don't rebuild)
- **Prospect audit UI + actions:** `app/(app)/prospect/*` (`page.tsx`,
  `new-audit.tsx`, `actions.ts`, `[id]/page.tsx`, `[id]/ai-visibility/page.tsx`),
  plus the public shareable report at `/audit/<token>` (already a public path).
- **SERP layer:** `lib/serp/*` — provider adapters (serper/serpapi/mock via
  `SERP_PROVIDER`), `grid.ts` (map-rank grid), `competitors.ts`, `findings.ts`,
  `budget.ts` (daily budget guard, `SERP_DAILY_REQUEST_CAP`), `match.ts`. See the
  `serp-provider-layer` memory.
- **Insight report:** migration `010_insight_report.sql` + `028_prospect_audit_vertical.sql`
  (vertical-aware). Prospect audit spends **map credits** (`spend_credits('map', …)`
  in `lib/credits`), so a deeper audit should charge credits the same way.
- **Vertical rules:** any audit content/templates go through `resolveForVertical`
  (`lib/vertical.mjs`) with dental stored as `NULL` — never `if (vertical === …)`.

### Guardrails for the new module (from CLAUDE.md)
- Multi-tenant: every table has `clinic_id`, every query filters it, RLS enforced.
- Design system "Clinical Minimal" (teal accent, `components/page.tsx` primitives).
- External API keys server-side only (new route or server action; never client).
- Charge **map credits** for expensive audits via the atomic `spend_credits` /
  refund-on-failure pattern (`lib/credits`, migration `020_credit_engine.sql`).
- Append a manual test checklist to `TESTING.md` per feature.
- New verticals = seed data, not code forks (flag `ENABLE_MULTI_VERTICAL` is ON in
  this dev `.env.local`).

### Suggested first step for the audit session
Scope what "deep audit" pulls together (PageSpeed + GMB/Places + SERP rank +
competitor set + AI synthesis), decide the DB shape (likely a new
`deep_audits`/`audit_findings` pair, clinic-scoped, RLS'd), and whether it extends
the existing prospect report or is a new surface. Plan first — it spans several
external APIs and credit costs.

---

## 4. Key files quick-ref
- Billing seam / adapters: `lib/billing/{provider,cashfree,manual}.ts`
- Webhook: `app/api/webhooks/cashfree/route.ts` · middleware public path: `lib/supabase/middleware.ts`
- Fulfillment RPCs: `supabase/migrations/{020,033,034}_*.sql`
  (`confirm_cashfree_payment`, `apply_plan_purchase`, `apply_pack_purchase`,
  `create_invoice`, `admin_start_payment_link`, `admin_payments_feed`)
- Admin surfaces: `app/admin/{page,payments,clinics}/*`
- Credits engine: `lib/credits` + `supabase/migrations/020_credit_engine.sql`
- Audit scaffolding to extend: `app/(app)/prospect/*`, `lib/serp/*`
