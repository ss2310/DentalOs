import "server-only";

// Deep Audit tunables + rough per-call cost table. All server-only. Costs are
// deliberate ESTIMATES for margin tracking (A3) — logged to audit_runs.
// est_api_cost_inr, not billed to anyone — so approximate INR is fine.

// Per-cycle free allowance (metered on clinics.deep_audits_used_this_cycle).
// Env override lets us tune without a migration. "Buy extra audit" comes later.
// Default 1/month; set DEEP_AUDIT_MONTHLY_LIMIT=2 in .env.local while testing so
// repeated test runs aren't blocked by the cap.
export const DEEP_AUDIT_MONTHLY_LIMIT = Number(process.env.DEEP_AUDIT_MONTHLY_LIMIT) || 1;

// Hard cost guard: at most 1 self + N competitors, capped at 5 entities total,
// each costing at most 1 Places Details + 1 PageSpeed + 1 Claude classification.
export const MAX_COMPETITORS = 3;
export const MAX_ENTITIES = 5;

// A scan is "recent" within this window; older → Stage 1 runs a fresh one.
export const SCAN_FRESHNESS_DAYS = 30;

// Website fetch guard — cap bytes per page so one bloated site can't blow memory
// or the Claude context (classification is the dominant Claude cost, and it
// scales with this cap). 100 KB of stripped text is ample to classify the
// website_llm metrics; a bloated site no longer balloons the token bill.
export const WEBSITE_BYTE_CAP = 100 * 1024; // 100 KB
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
  claudeSynthesize: 8, // one Stage-6 plan-synthesis call (larger output)
} as const;

// Stage 6 model id (env-overridable), same fallback chain as the classifier.
export const AUDIT_SYNTH_MODEL =
  process.env.AUDIT_SYNTH_MODEL || process.env.NOTES_AGENT_MODEL || "claude-sonnet-4-6";

// Stage 3 (website classify) + Stage 4 (citation parse) model. These are
// extraction/classification tasks, not writing — Haiku 4.5 handles them well at
// ~3x lower cost than Sonnet, and they're the two highest-volume Claude calls in
// a run. Deliberately NOT chained to NOTES_AGENT_MODEL so voice-notes tuning
// can't silently upgrade the audit's cost. Env-overridable.
export const AUDIT_CLASSIFY_MODEL =
  process.env.AUDIT_CLASSIFY_MODEL || "claude-haiku-4-5";

// Stage 6 output cap. A full 12–15 item plan (headline + competitor story +
// per-item description/evidence/context, in Hinglish) runs well past 4k tokens —
// too small a cap truncates the JSON mid-array and every parse fails. 8k gives
// comfortable headroom; env-overridable if plans get richer.
export const AUDIT_SYNTH_MAX_TOKENS = Number(process.env.AUDIT_SYNTH_MAX_TOKENS) || 8000;

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
