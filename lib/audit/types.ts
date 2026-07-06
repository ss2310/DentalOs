import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Shared types for the Deep Audit pipeline (Stages 1–3). The stages write RAW
// signals only; scoring/synthesis (Stages 4–6) come later.

export type EntityKind = "self" | "competitor";

// A row of audit_runs as the pipeline reads it (subset we use).
export type AuditRun = {
  id: string;
  clinic_id: string;
  status: string;
  stage_cursor: string | null;
  est_api_cost_inr: number | null;
  competitor_place_ids: string[] | null;
};

// A row of audit_entities.
export type AuditEntity = {
  id: string;
  run_id: string;
  clinic_id: string;
  entity_kind: EntityKind;
  place_id: string | null;
  display_name: string | null;
  gbp_url: string | null;
  website_url: string | null;
};

// A metric_definitions row (the website_llm subset the classifier needs).
export type MetricDef = {
  metric_key: string;
  display_name: string;
  source: string;
  value_type: "number" | "boolean" | "enum" | "text";
  enum_options: string[] | null;
  rubric: string | null;
};

// One RAW measurement to insert into audit_signals. Exactly one of
// value_number / value_bool / value_text carries the reading (per value_type).
export type SignalInsert = {
  run_id: string;
  entity_id: string;
  clinic_id: string;
  metric_key: string;
  value_number?: number | null;
  value_bool?: boolean | null;
  value_text?: string | null;
  source: string;
  raw_meta?: Record<string, unknown> | null;
};

// What a stage returns to the orchestrator.
export type StageResult = {
  // Added to audit_runs.est_api_cost_inr (rough INR, margin tracking).
  costInr: number;
  // Human-readable one-liner stored in audit_runs.stage_detail.
  detail: string;
};

// Handed to every stage. `admin` is the service-role client (RLS bypassed —
// each stage MUST scope every write to run.clinic_id + run.id). `run` is the
// audit_runs row, already verified to belong to the caller's clinic.
export type StageContext = {
  admin: SupabaseClient;
  run: AuditRun;
};

// A fetched, sanitized website snapshot handed to the Claude classifier.
export type WebsiteSnapshot = {
  finalUrl: string | null; // after redirects (used for https_ssl)
  isHttps: boolean;
  text: string; // scripts/styles stripped, byte-capped
  fetchError: string | null;
};

// ---- Stage 4: AI-visibility layer ----

export type QueryLayer = "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

// A generated query with its framework layer.
export type AuditQuery = { layer: QueryLayer; text: string };

// One engine's answer to one query (from an AiEngine adapter). `status` records
// whether the call actually succeeded: an errored/timed-out call is 'error' with
// an empty text — NEVER a measured negative (see the citation rollup + migration
// 038). error_detail carries the failure reason for the audit trail.
export type EngineAnswer = {
  layer: QueryLayer;
  query: string;
  engine: string; // 'gemini'|'perplexity'|'chatgpt'|'google_aio'
  present: boolean; // engine produced an answer / AIO was present
  text: string; // answer text ('' when none)
  sources: { url: string; title?: string }[]; // grounded/cited urls
  status: "ok" | "error"; // 'error' → the engine call failed after retries
  error_detail?: string; // failure reason when status='error'
};

// Claude's per-query extraction for one engine batch. Self-citation is decided
// deterministically (lib/audit/self-match.mjs), NOT here — Claude only extracts
// which known competitors are named and types the source URLs.
export type CitationParse = {
  competitors_cited: string[];
  sources: { url: string; domain: string; type: string }[];
};

// A row to insert into ai_query_results. self_cited is NULLABLE: null = "not
// measured" (the engine errored); false = measured & not cited; true = measured &
// cited. answer_text/answer_sources persist the FULL raw engine response so the
// verdict is checkable forever; matched_string records the exact string that made
// self_cited true.
export type AiQueryResultInsert = {
  run_id: string;
  clinic_id: string;
  layer: string;
  query_text: string;
  engine: string;
  status: "ok" | "error";
  error_detail: string | null;
  self_cited: boolean | null;
  matched_string: string | null;
  competitors_cited: string[];
  sources: CitationParse["sources"] | null;
  answer_text: string;
  answer_sources: EngineAnswer["sources"] | null;
};
