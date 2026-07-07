# HANDOFF — Premium AI Visuals for the Social Content Engine

Implements the decision from the 07 Jul 2026 session, exactly as agreed.
Read `CLAUDE.md` first. Branch from `main` (everything is merged; migrations
001–044 applied by the user in the SQL editor — verify `applied_migrations`
shows 044 before starting).

## 0. The decision (do not re-litigate)

- Free composed template images (satori, `lib/social/render.ts`) STAY the
  default. "Images free" remains true and remains the demo hook.
- NEW optional **"Premium visual"**: an AI-generated BACKGROUND image behind
  the existing composed text/logo/brand overlay — a HYBRID, never a pure AI
  image. Reasons (fixed): image models can't render Hinglish text reliably;
  composition guarantees exact brand lockup; and the safety rails below.
- **Pricing: +1 content credit for a premium single, +3 for a premium
  6-slide carousel.** Spend via `spendCredits("content", n, "generation")`
  BEFORE the provider call, refund on failure — the exact
  `app/api/generate/social/route.ts` pattern. Template renders stay 0.
- **Model: Gemini image generation first** (the stack already carries
  `GEMINI_API_KEY` as an optional audit key), behind a provider adapter so
  FLUX / gpt-image can replace it without touching pricing or UI.
- After ~1 month of real usage, the user decides: keep à-la-carte vs fold
  into a ₹2,999 plan tier. Ship the toggle + a usage counter; nothing more.

## 1. HARD SAFETY RAILS (the whole feature fails review without these)

AI visuals must NEVER depict:
1. Fake patients, fake smiles, or anything presentable as a treatment
   result — **no before/after imagery of any kind**. Real results come ONLY
   from Moment Capture with recorded consent (`capture_moments`); an AI
   fake would be misleading medical advertising and would poison that trust.
2. **No photorealistic human faces at all** (a lifestyle face reads as "a
   patient"). Hands, objects, scenes, interiors, food, festivals, abstract
   textures are all fine.
3. No clinical procedures, no instruments-in-mouths, no gore/decay shock
   imagery.

Enforce in the PROMPT (constraints appended server-side, non-overridable —
user text is data, never template vars, same as `lib/social/generate.ts`)
AND document that the approval queue is the human backstop: premium visuals
land as normal pending-approval posts; nothing auto-publishes.

## 2. Provider adapter (mirror `lib/serp/`'s registry pattern)

New `lib/visuals/`:

- `types.ts` — `ImageProvider { generate(opts: { prompt: string; width: number; height: number }): Promise<Buffer> }`.
- `gemini.ts` — Gemini image generation via `GEMINI_API_KEY`. Request an
  image sized/croppable to 1080×1080 and 1080×1920 (generate at the target
  aspect; if the API only does fixed aspects, generate square + 9:16
  separately — never stretch).
- `mock.ts` — deterministic gradient PNG (reuse satori) so dev/tests run
  keyless, exactly like `lib/serp/mock.ts`.
- `index.ts` — registry keyed by `IMAGE_PROVIDER` env: `gemini` | `mock`.
  **Default `mock`** (consistent with SERP) and document loudly in
  `docs/DEPLOYMENT.md` + `.env.local.example` that production must set
  `IMAGE_PROVIDER=gemini` — do not repeat the SERP_PROVIDER footgun
  silently.
- `prompt.ts` — pure + unit-testable: builds the image prompt from
  `{ topic, campaignType, brandColors, season? }` and ALWAYS appends the
  safety constraints block (rails §1). Style direction: "clean, warm,
  editorial lifestyle photography, Indian context, soft light, generous
  negative space at the top third for a text overlay" — negative space
  matters because the satori overlay needs somewhere to sit.

## 3. Renderer integration (`lib/social/render.ts`)

- `renderPostImages` gains `opts.premium?: boolean` (and the compose path in
  `lib/capture/compose.ts` is explicitly OUT of scope — real patient photos
  never mix with AI imagery).
- New layout `aiHero(bg: dataUri, …)`: full-bleed `<img>` background layer →
  a bottom-up dark scrim (`linear-gradient(transparent 45%, rgba(0,0,0,.55))`)
  for text legibility → the existing headline/logo-chip/footer overlay in
  white. Carousel premium: ONE background generated per run, reused across
  the 6 slides with the existing slide text overlays (cost stays 1 image…
  BUT price is +3 credits as decided — margin covers retries; if you instead
  generate per-slide, note the COGS in the PR).
- Emoji stripping, font loading, upload-to-`social-renders`, signed URLs:
  all unchanged.

## 4. API + credits (`app/api/social/render/route.ts`)

- Body gains `premium?: boolean`. When true:
  1. Resolve the post (session client, RLS — unchanged).
  2. `spendCredits("content", post.format === "carousel" ? 3 : 1,
     "generation", post.id)` → 402 + upgrade flag on insufficient (copy the
     generate route's error shape).
  3. Provider `generate()` → on ANY failure `refundCredit(ledgerId)` and
     return the friendly retryable error.
  4. Render hybrid → upload → update `render_paths` + `premium_visual=true`.
- Template renders (`premium` absent/false) keep costing zero — assert this
  in the test checklist.

## 5. Migration 045

```sql
alter table social_posts add column if not exists premium_visual boolean not null default false;
-- usage counter for the pricing decision comes free: count(*) where premium_visual
insert into applied_migrations (version, name) values ('045','premium_visuals') on conflict (version) do nothing;
```
(Additive + idempotent, house style. No RLS changes needed.)

## 6. UI

- **Review screen** (`review-client.tsx`) + **publish screen**
  (`publish-client.tsx`): next to "Render image (free)" add
  "✨ Premium visual (1 credit)" / "(3 credits)" for carousels. On 402 →
  toast + upgrade nudge (same as generation).
- Show a small "✨ Premium" chip on rendered previews when
  `premium_visual` is true.
- `/admin/social` tile: add a premium-visuals count column (the month-1
  usage data the pricing decision needs).
- Copy rule: never call the template images "basic" in the UI — they're
  "branded"; premium is "photo backdrop". The free tier must not feel
  nerfed.

## 7. Env / docs

- `IMAGE_PROVIDER` (`gemini` | `mock`, default mock) + reuse
  `GEMINI_API_KEY`. Optional `IMAGE_MODEL` override for the Gemini model id.
- Update: `docs/DEPLOYMENT.md` env table (required-for-feature),
  `.env.local.example`, `lib/help-kb.ts` (social section + credits topic:
  "premium photo backdrop: 1 credit single / 3 carousel — optional, branded
  images stay free"), `docs/FEATURES.md` Social bullet.

## 8. Tests + verification (append to TESTING.md)

`scripts/test-visual-prompt.mjs` (node --test, pure):
- safety block is ALWAYS appended regardless of user topic text;
- a topic containing "before and after of my patient" still produces a
  prompt whose constraints forbid faces/before-afters (constraints come
  after and are marked non-negotiable);
- prompt includes brand-color + negative-space direction.

Manual checklist: template render still 0 credits (balance unchanged);
premium single spends exactly 1 / carousel 3; provider failure refunds;
`IMAGE_PROVIDER` unset → mock gradient (obvious in dev, documented for
prod); premium image carries the full brand overlay + is legible over the
scrim; approval queue shows the ✨ chip; admin tile counts it.

Live E2E (needs `GEMINI_API_KEY` + `IMAGE_PROVIDER=gemini` in `.env.local`):
one real premium single + one carousel on the dev clinic via a dev-guarded
harness (pattern: `app/api/dev/social-e2e`), eyeball the output, then clean
up rows/storage — the discipline used for 042/043 verification.

## 9. Estimated economics (for the PR description)

Gemini image ≈ ₹3–4/generation. Premium single: ₹10 retail vs ~₹4 COGS.
Carousel (+3 credits = ₹30 retail) vs ₹4–24 COGS depending on one-bg vs
per-slide. Break-even is safe in all configurations; per-slide generation is
a quality call, not a margin risk.

## 10. Out of scope (explicitly)

- No AI imagery in Moment Capture composition (real photos only, ever).
- No auto-premium default, no plan-price change, no image editing/upscaling,
- No video. No changes to the free template layouts.
