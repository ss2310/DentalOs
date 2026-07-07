// Types for the pure scoring core (lib/audit/scoring.mjs). Kept as a sibling
// .d.ts so the .mjs stays runnable by `node --test` with no build step while TS
// callers (the Stage-5 wrapper) get full typing.

export const NOT_FOUND_RANK: number;
export const SCORE_BANDS: { min: number; band: string }[];
export const MIN_GAP_COVERAGE: number;

export function scoreBand(avg: number | null): string | null;

// Coverage gate — the single source of truth for "did we measure this moat
// enough to recommend against it?". Stage 6 + the report MUST consult these.
export function moatCoverage(ms: Pick<MoatScore, "signals_measured" | "signals_total">): number;
export function isGapEligible(ms: Pick<MoatScore, "signals_measured" | "signals_total">): boolean;

// One planning gap. Note: deliberately NO raw_score — the planning door exposes
// no path to a raw moat score.
export interface PlannableGap {
  moat_key: string;
  weight_pct: number;
  self_score: number;
  best_rival_score: number | null;
  best_rival_index: number | null;
  gap: number | null; // best_rival_score − self_score (null when no rivals)
  weighted_gap: number; // max(0, gap) × weight_pct / 100, 2dp
}

// The ONLY door Stage 6 uses to pick + order plan actions. Applies the coverage
// gate first, so a not_yet_measured moat can never appear in the output.
export function plannableGaps(
  selfScores: MoatScore[],
  rivalScoresList: MoatScore[][],
  moatConfig: MoatConfigRow[],
): PlannableGap[];

// One audit_signals row as scoreEntity reads it (the typed-value subset).
export interface SignalRow {
  metric_key: string;
  value_number?: number | null;
  value_bool?: boolean | null;
  value_text?: string | null;
}

// A moat_config row (weights / max / version).
export interface MoatConfigRow {
  moat_key: string;
  weight_pct: number;
  max_score: number;
  is_active?: boolean;
  version?: number;
}

// A metric_definitions row (accepted for signature parity; unused by the math).
export interface MetricDefRow {
  metric_key: string;
  source?: string;
  value_type?: string;
}

export interface GridPoint {
  rank: number | null;
}

export interface GridPins {
  green_pins: number;
  yellow_pins: number;
  red_pins: number;
  out_pins: number;
  total_pins: number;
  agrp: number | null;
  rank_spread: number | null;
}

export function deriveGridPins(
  gridPoints: GridPoint[] | null | undefined,
  notFoundRank?: number,
): GridPins;

export function visibilityScore(
  pins: Partial<GridPins> | null | undefined,
): number | null;

export function deadZonePct(
  pins: Partial<GridPins> | null | undefined,
): number | null;

export interface MoatScore {
  moat_key: string;
  score: number;
  raw_score: number;
  max_score: number;
  signals_measured: number;
  signals_total: number;
  config_version: number;
  coverage: number; // signals_measured / signals_total, 2dp (0 when no inputs)
  gap_eligible: boolean; // false ⇒ excluded from gap prioritization + plan items
  measurement_status: "measured" | "not_yet_measured";
  detail?: { visibility: number | null; dead_zone_pct: number | null };
}

export interface AuditSummary {
  average_digital_score: number | null;
  score_band: string | null;
  expected_market_share_pct: number | null;
  fair_share_patients: number | null;
  actual_patients_est: number | null;
  leaked_patients: number | null;
  revenue_loss_month: number | null;
  annual_revenue_loss: number | null;
  market_ready: boolean;
}

export interface ScoreEntityOpts {
  entityKind?: "self" | "competitor";
  hasWebsite?: boolean;
  market?: {
    searchVolume?: number | null;
    avgPatientValue?: number | null;
    ltvMultiplier?: number | null;
  } | null;
}

export function scoreEntity(
  entitySignals: SignalRow[],
  moatConfig: MoatConfigRow[],
  metricDefs?: MetricDefRow[] | null,
  opts?: ScoreEntityOpts,
): {
  moatScores: MoatScore[];
  summary: AuditSummary;
  config_version: number;
};
