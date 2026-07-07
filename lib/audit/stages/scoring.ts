import "server-only";

import { scoreEntity } from "@/lib/audit/scoring.mjs";
import type { MoatScore } from "@/lib/audit/scoring";
import type { StageContext, StageResult } from "@/lib/audit/types";

// STAGE 5 — SCORING. Pure-function scoring (lib/audit/scoring.mjs) persisted to
// the DB: for EVERY entity (self + each competitor, identical path) compute the
// six moat scores + the rolled-up summary from that entity's audit_signals, and
// write moat_scores + one audit_summaries row. No external API calls (cost 0).
// Idempotent: clears this run's moat_scores + audit_summaries first.
//
// Only the 035 columns are persisted (score/max/measured/total/config_version).
// The coverage gate (gap_eligible / measurement_status) is intentionally NOT
// stored — it is recomputed on read from signals_measured/signals_total via
// isGapEligible(), so the gate can never drift from a stale column.

// Row shapes for the entity's signals (the typed-value subset).
type SignalRow = {
  metric_key: string;
  value_number: number | null;
  value_bool: boolean | null;
  value_text: string | null;
};

type MoatConfigRow = {
  moat_key: string;
  weight_pct: number;
  max_score: number;
  is_active: boolean;
  version: number;
};

export async function stageScoring(ctx: StageContext): Promise<StageResult> {
  const { admin, run } = ctx;

  const { data: entsData } = await admin
    .from("audit_entities")
    .select("id, entity_kind, website_url")
    .eq("run_id", run.id);
  const entities = (entsData ?? []) as {
    id: string;
    entity_kind: "self" | "competitor";
    website_url: string | null;
  }[];
  if (entities.length === 0) throw new Error("No entities to score (run Stage 1).");

  const { data: cfgData } = await admin
    .from("moat_config")
    .select("moat_key, weight_pct, max_score, is_active, version")
    .eq("is_active", true);
  const moatConfig = (cfgData ?? []) as MoatConfigRow[];
  if (moatConfig.length === 0) throw new Error("moat_config is empty (run migration 035).");

  // Market inputs (self-only revenue gating). Revenue math itself is deferred —
  // scoreEntity returns the gating flag but null figures until the formula lands.
  const { data: clinic } = await admin
    .from("clinics")
    .select(
      "market_monthly_search_volume, market_avg_patient_value_inr, market_ltv_multiplier",
    )
    .eq("id", run.clinic_id)
    .single();
  const market = {
    searchVolume: clinic?.market_monthly_search_volume ?? null,
    avgPatientValue: clinic?.market_avg_patient_value_inr ?? null,
    ltvMultiplier: clinic?.market_ltv_multiplier ?? null,
  };

  // Idempotent: drop this run's scores + summaries before recomputing.
  await admin.from("moat_scores").delete().eq("run_id", run.id);
  await admin.from("audit_summaries").delete().eq("run_id", run.id);

  const moatRows: Record<string, unknown>[] = [];
  const summaryRows: Record<string, unknown>[] = [];

  for (const entity of entities) {
    const { data: sigData } = await admin
      .from("audit_signals")
      .select("metric_key, value_number, value_bool, value_text")
      .eq("run_id", run.id)
      .eq("entity_id", entity.id);
    const signals = (sigData ?? []) as SignalRow[];

    const isSelf = entity.entity_kind === "self";
    const { moatScores, summary } = scoreEntity(signals, moatConfig, null, {
      entityKind: entity.entity_kind,
      hasWebsite: entity.website_url != null,
      market: isSelf ? market : null,
    });

    for (const ms of moatScores as MoatScore[]) {
      moatRows.push({
        run_id: run.id,
        entity_id: entity.id,
        clinic_id: run.clinic_id,
        moat_key: ms.moat_key,
        score: ms.score,
        max_score: ms.max_score,
        signals_measured: ms.signals_measured,
        signals_total: ms.signals_total,
        config_version: ms.config_version,
      });
    }

    summaryRows.push({
      run_id: run.id,
      entity_id: entity.id,
      clinic_id: run.clinic_id,
      average_digital_score: summary.average_digital_score,
      score_band: summary.score_band,
      // Revenue math deferred (formula not yet provided) — nulls, never guessed.
      expected_market_share_pct: null,
      revenue_loss_month: null,
      annual_revenue_loss: null,
      // Stage 6 fills the self row's synthesis.
      synthesis: null,
    });
  }

  const { error: msErr } = await admin.from("moat_scores").insert(moatRows);
  if (msErr) throw new Error(`Failed to write moat_scores: ${msErr.message}`);
  const { error: sumErr } = await admin.from("audit_summaries").insert(summaryRows);
  if (sumErr) throw new Error(`Failed to write audit_summaries: ${sumErr.message}`);

  const self = entities.find((e) => e.entity_kind === "self");
  const selfSummary = summaryRows.find(
    (r) => r.entity_id === self?.id,
  ) as { average_digital_score: number | null } | undefined;
  const avg = selfSummary?.average_digital_score;
  return {
    costInr: 0,
    detail: `Scored ${entities.length} entities${avg != null ? ` (you: ${avg})` : ""}`,
  };
}
