import "server-only";

// Deep Audit tunables + rough per-call cost table. All server-only. Costs are
// deliberate ESTIMATES for margin tracking (A3) — logged to audit_runs.
// est_api_cost_inr, not billed to anyone — so approximate INR is fine.

// Per-cycle free allowance (metered on clinics.deep_audits_used_this_cycle).
// Env override lets us tune without a migration. "Buy extra audit" comes later.
export const DEEP_AUDIT_MONTHLY_LIMIT = Number(process.env.DEEP_AUDIT_MONTHLY_LIMIT) || 2;

// Hard cost guard: at most 1 self + N competitors, capped at 5 entities total,
// each costing at most 1 Places Details + 1 PageSpeed + 1 Claude classification.
export const MAX_COMPETITORS = 3;
export const MAX_ENTITIES = 5;

// A scan is "recent" within this window; older → Stage 1 runs a fresh one.
export const SCAN_FRESHNESS_DAYS = 30;

// Website fetch guard — cap bytes per page so one bloated site can't blow memory
// or the Claude context. Scripts/styles are stripped before this cap applies.
export const WEBSITE_BYTE_CAP = 500 * 1024; // 500 KB
export const WEBSITE_FETCH_TIMEOUT_MS = 12_000;
export const PAGESPEED_TIMEOUT_MS = 30_000;

// Rough per-call INR estimates (margin tracking only).
export const COST_INR = {
  serpRequest: 0.4, // one grid-point SERP request (serper)
  placesTextSearch: 3, // Places Text Search (New)
  placesDetails: 4, // Places Details (New), Pro/Enterprise field mask
  pagespeed: 0, // PageSpeed Insights is free
  claudeClassify: 3, // one website_llm classification call
  // Stage 4 (AI visibility)
  gemini: 1, // one Gemini grounded query
  openrouterSonar: 2, // one Perplexity Sonar query via OpenRouter
  openrouterChatgpt: 1, // one gpt-4o-mini query via OpenRouter
  serperSearch: 0.4, // one Serper /search (google_aio)
  claudeParse: 3, // one Claude citation-parse batch per engine
} as const;

// ---- Stage 4: AI-visibility layer ----
export const AI_QUERIES_PER_LAYER = 1; // → 6 queries across L1–L6
export const AI_ENGINE_DELAY_MS = 700; // polite gap between sequential calls
// Cap OpenRouter completion tokens. OpenRouter reserves credits against a
// model's MAX context, so leaving this unset makes Sonar demand ~65k tokens'
// worth of balance up front (402). A short cap is plenty for an answer + its
// citations and keeps the run affordable.
export const AI_ENGINE_MAX_TOKENS = 1200;

// Model ids (env-overridable). Perplexity + ChatGPT run through OpenRouter on the
// ONE OPENROUTER_API_KEY; a direct Perplexity/OpenAI key later needs only a
// base-URL + key swap in the adapter. Sonar/gpt ids verified against OpenRouter's
// live model list; the Gemini id is confirmed at test time.
export const GEMINI_MODEL = process.env.AUDIT_GEMINI_MODEL || "gemini-2.5-flash";
export const OPENROUTER_SONAR_MODEL =
  process.env.AUDIT_SONAR_MODEL || "perplexity/sonar";
export const OPENROUTER_CHATGPT_MODEL =
  process.env.AUDIT_CHATGPT_MODEL || "openai/gpt-4o-mini";

// Vertical-default treatment set for L2/L6 query generation when the clinic has
// no rate_cards menu. Dental today; becomes resolveForVertical-driven per niche.
export const DENTAL_TREATMENTS_DEFAULT = [
  "dental implants",
  "root canal treatment",
  "braces",
  "teeth whitening",
];
