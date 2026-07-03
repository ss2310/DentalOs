# CLAUDE.md — GrowthOS

Permanent project rules. Read this before building any feature.

## Project

**GrowthOS** — multi-tenant SaaS for Indian dental clinics. Two layers:

1. **Practice management** — patients, appointments, billing, treatment
   pipeline, recalls, leads, revenue recovery.
2. **AI marketing content generation.**

**Users:** clinic receptionists and doctors, on **Android Chrome** and desktop.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Supabase** — Postgres, Auth, Row Level Security (RLS), Edge Functions
- **Vercel** for hosting
- **Claude API** for content generation, called from a **server-side API route
  only** (never expose the key to the client).

## Non-negotiable rules

### 1. Multi-tenancy

- Every table has a `clinic_id` column.
- **Every query filters by `clinic_id`.**
- Isolation is enforced with **Supabase RLS policies** keyed to the logged-in
  user's clinic — **not only application code.**
- A data leak between clinics is the worst possible bug. When in doubt, add the
  RLS policy and the filter.

### 2. Design system — "Clinical Fresh"

Dental-native, bold yet accessible. Teal brand, deep-teal sidebar, clean ink.

- **Fonts:**
  - **Inter** — all body/UI text (maximally readable).
  - **Sora** (`font-display`) — page titles and big stat numbers only.
- **Colors:**
  - Primary (brand + actions) `#0D9488` (teal)
  - Ink (the sidebar rail) `#0B2E2B`
  - Mint (active states, accents) `#2DD4BF`
  - Success `#059669`
  - Warning `#D97706`
  - Danger `#DC2626`
  - Borders 1px `#E2E8F0`
  - Text `#0F172A` primary / `#64748B` secondary
  - Background white; `#F5F9F8` for subtle sections/canvas
- **Sidebar:** deep-teal (`ink`) rail, light-on-dark nav, **mint** icon/accent on
  the active item. Tooth brand mark + "GrowthOS" wordmark at the top.
- **Cards:** white, 1px border, **16px radius**, soft lift (`shadow-card` — a
  whisper, never heavy).
- **Buttons:** teal fill, **10px radius**.
- **Badges:** pill shape (999px radius), 12px text, tinted backgrounds.
- **Page titles:** 26px semibold, `font-display`.
- **Stat numbers:** `font-display`, large; the single most important metric on a
  page uses the `hero` StatCard (solid teal fill).
- **Section headers:** 14px uppercase, `#64748B`.
- **NO neon. NO heavy shadows. Gradients:** avoid — the one hero metric uses a
  solid brand fill, not a gradient.

Tailwind tokens live in `tailwind.config.ts` (`primary`, `ink`, `mint`,
`success`, `warning`, `danger`, `border`, `text.primary`, `text.secondary`,
`subtle`; `rounded-card` / `rounded-button` / `rounded-pill`; `shadow-card`;
`font-display`). Shared primitives: `components/page.tsx` (PageHeader, StatCard
with `hero`, StatGrid, SectionHeader, EmptyState). Prefer these over ad-hoc
styling so the look stays consistent.

### 3. WhatsApp messaging

- All patient messaging = **wa.me deep links** opened in a **new tab**.
- Format: `https://wa.me/91<number>?text=<url-encoded Hinglish message>`
- **No WhatsApp Business API.**
- Every send sets a `*_sent_at` timestamp. Once the timestamp exists, hide the
  button and show a green **"✓ Sent"** label (anti-duplicate pattern).

### 4. Locale

- Currency: **₹ INR**
- Timezone: **IST (Asia/Kolkata)**
- Phones: **+91**
- Dates: **DD MMM YYYY**

### 5. Mobile-first

- Minimum **44px** tap targets.
- Minimum **14px** font.
- Tables collapse to **stacked cards** on mobile.
- Sidebar becomes a **hamburger** menu on mobile.

### 6. Testing

- After building each feature, append a short **manual test checklist** to
  `TESTING.md`.

### 7. Code style

- Keep components simple and readable.
- **No component libraries beyond Tailwind.**
- Prefer **server components**; use client components only where interaction
  demands it.
