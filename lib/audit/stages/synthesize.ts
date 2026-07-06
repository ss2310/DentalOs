import "server-only";

import { buildSynthesisPayload } from "@/lib/audit/synthesis-input.mjs";
import { validateSynthesis } from "@/lib/audit/synthesis-validate.mjs";
import { visibilityScore } from "@/lib/audit/scoring.mjs";
import { resolveForVertical } from "@/lib/vertical.mjs";
import { callSynthesisModel } from "@/lib/audit/synthesis";
import { COST_INR } from "@/lib/audit/config";
import type { StageContext, StageResult } from "@/lib/audit/types";
import type { PriorInput, SignalValue, SynthesisPayload } from "@/lib/audit/synthesis-input";
import type { PlanItemJson } from "@/lib/audit/synthesis-validate";

// STAGE 6 — SYNTHESIZE. Assembles the evidence-only payload from the scored
// rows, calls Claude, and REJECTS+RETRIES until every plan item has evidence +
// eligible metric_keys (else the stage fails — no weak plan is ever persisted).
// On success: supersedes the prior active plan, writes audit_plans + plan_items,
// and stores the JSON in the self audit_summaries.synthesis. Idempotent: clears
// this run's plan first.

const MAX_ATTEMPTS = 3;

type EntityRow = { id: string; entity_kind: "self" | "competitor"; display_name: string | null };
type MoatScoreRow = {
  entity_id: string;
  moat_key: string;
  score: number;
  signals_measured: number;
  signals_total: number;
};
type SignalRow = {
  entity_id: string;
  metric_key: string;
  value_number: number | null;
  value_bool: boolean | null;
  value_text: string | null;
};

// One display value per signal (bool false is a real value; only null = absent).
function displayValue(s: SignalRow): SignalValue {
  if (s.value_number != null) return s.value_number;
  if (s.value_bool != null) return s.value_bool;
  if (s.value_text != null) return s.value_text;
  return null;
}

function visFromValues(v: Record<string, SignalValue>): number | null {
  const num = (k: string) => (typeof v[k] === "number" ? (v[k] as number) : null);
  return visibilityScore({
    total_pins: num("total_pins"),
    green_pins: num("green_pins"),
    yellow_pins: num("yellow_pins"),
    red_pins: num("red_pins"),
    out_pins: num("out_pins"),
  });
}

export async function stageSynthesize(ctx: StageContext): Promise<StageResult> {
  const { admin, run } = ctx;

  // --- entities ---
  const { data: entsData } = await admin
    .from("audit_entities")
    .select("id, entity_kind, display_name")
    .eq("run_id", run.id);
  const entities = (entsData ?? []) as EntityRow[];
  const self = entities.find((e) => e.entity_kind === "self");
  if (!self) throw new Error("No self entity (run earlier stages).");
  const competitors = entities.filter((e) => e.entity_kind === "competitor");

  // --- config, metric catalog (vertical-resolved), scores, signals ---
  const { data: clinic } = await admin
    .from("clinics")
    .select("business_name, area, city, vertical")
    .eq("id", run.clinic_id)
    .single();

  const { data: cfgData } = await admin
    .from("moat_config")
    .select("moat_key, display_name, weight_pct")
    .eq("is_active", true);
  const moatConfig = (cfgData ?? []) as {
    moat_key: string;
    display_name: string;
    weight_pct: number;
  }[];

  const { data: defRows } = await admin
    .from("metric_definitions")
    .select("metric_key, moat_key, display_name, vertical")
    .eq("is_active", true);
  const defs = resolveForVertical(
    (defRows ?? []) as { metric_key: string; moat_key: string; display_name: string; vertical: string | null }[],
    clinic?.vertical ?? "dental",
    (r: { metric_key: string }) => r.metric_key,
  ) as { metric_key: string; moat_key: string; display_name: string }[];
  const metricsByMoat: Record<string, { metric_key: string; label: string }[]> = {};
  for (const d of defs) {
    (metricsByMoat[d.moat_key] ??= []).push({ metric_key: d.metric_key, label: d.display_name });
  }

  const { data: scoreData } = await admin
    .from("moat_scores")
    .select("entity_id, moat_key, score, signals_measured, signals_total")
    .eq("run_id", run.id);
  const scoresByEntity = new Map<string, MoatScoreRow[]>();
  for (const r of (scoreData ?? []) as MoatScoreRow[]) {
    const arr = scoresByEntity.get(r.entity_id) ?? [];
    arr.push(r);
    scoresByEntity.set(r.entity_id, arr);
  }

  const { data: sigData } = await admin
    .from("audit_signals")
    .select("entity_id, metric_key, value_number, value_bool, value_text")
    .eq("run_id", run.id);
  const valuesByEntity = new Map<string, Record<string, SignalValue>>();
  for (const s of (sigData ?? []) as SignalRow[]) {
    const map = valuesByEntity.get(s.entity_id) ?? {};
    map[s.metric_key] = displayValue(s);
    valuesByEntity.set(s.entity_id, map);
  }

  const selfScores = scoresByEntity.get(self.id) ?? [];
  const selfValues = valuesByEntity.get(self.id) ?? {};
  const rivals = competitors.map((c) => ({
    name: c.display_name ?? "A competitor",
    scores: scoresByEntity.get(c.id) ?? [],
    values: valuesByEntity.get(c.id) ?? {},
  }));

  // --- prior-run context (deltas + prior-plan completion) ---
  const { data: selfSummary } = await admin
    .from("audit_summaries")
    .select("average_digital_score")
    .eq("run_id", run.id)
    .eq("entity_id", self.id)
    .maybeSingle();
  const avgNow = selfSummary?.average_digital_score ?? null;
  const prior = await loadPrior(admin, run, selfValues, avgNow);

  // --- assemble payload + guardrails. buildSynthesisPayload is a .mjs module
  //     (types inferred from JS under allowJs); cast the result to its .d.ts
  //     shape, as the repo does at every .mjs call site. ---
  const { payload, eligibleMetricKeys, metricToMoat, gapOrder } = buildSynthesisPayload({
    selfScores,
    rivals,
    moatConfig,
    metricsByMoat,
    selfValues,
    clinic: {
      name: clinic?.business_name ?? "",
      area: clinic?.area ?? "",
      city: clinic?.city ?? "",
    },
    prior,
  }) as unknown as {
    payload: SynthesisPayload;
    eligibleMetricKeys: string[];
    metricToMoat: Record<string, string>;
    gapOrder: string[];
  };
  if (payload.gaps.length === 0) {
    throw new Error(
      "Not enough measured competitive gaps to build a plan — collect more signals and retry.",
    );
  }

  // --- reject-and-retry the model until the plan validates ---
  let plan: PlanItemJson[] | null = null;
  let raw: Record<string, unknown> | null = null;
  let lastReason = "";
  let attempts = 0;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    attempts++;
    try {
      raw = await callSynthesisModel(payload, lastReason || undefined);
    } catch (err) {
      lastReason = err instanceof Error ? err.message : "model call failed";
      continue;
    }
    const v = validateSynthesis(raw, { eligibleMetricKeys, metricToMoat, gapOrder });
    if (v.ok) {
      plan = v.plan;
      break;
    }
    lastReason = v.reason;
    console.warn(`[synthesize] attempt ${attempts} rejected: ${v.reason}`);
  }
  if (!plan || !raw) {
    throw new Error(`Plan synthesis failed after ${attempts} attempts: ${lastReason}`);
  }

  // --- persist: supersede prior, write plan, store synthesis ---
  await admin
    .from("audit_plans")
    .update({ status: "superseded" })
    .eq("clinic_id", run.clinic_id)
    .eq("status", "active");

  // Idempotent: drop any prior plan for THIS run before reinserting.
  await admin.from("audit_plans").delete().eq("run_id", run.id);

  const headline = String(raw.headline ?? "");
  const { data: planRow, error: planErr } = await admin
    .from("audit_plans")
    .insert({
      run_id: run.id,
      clinic_id: run.clinic_id,
      title: "15-Day Growth Plan",
      summary: headline,
      status: "active",
    })
    .select("id")
    .single();
  if (planErr || !planRow) throw new Error(`Failed to write audit_plan: ${planErr?.message}`);

  const itemRows = plan.map((it) => ({
    plan_id: planRow.id,
    clinic_id: run.clinic_id,
    day_number: it.day_number,
    title: it.title,
    description: it.description,
    evidence: it.evidence,
    metric_keys: it.metric_keys,
    competitor_context: it.competitor_context,
    effort: it.effort,
    status: "pending",
  }));
  const { error: itemsErr } = await admin.from("plan_items").insert(itemRows);
  if (itemsErr) throw new Error(`Failed to write plan_items: ${itemsErr.message}`);

  const { error: synthErr } = await admin
    .from("audit_summaries")
    .update({ synthesis: raw })
    .eq("run_id", run.id)
    .eq("entity_id", self.id);
  if (synthErr) throw new Error(`Failed to store synthesis: ${synthErr.message}`);

  return {
    costInr: COST_INR.claudeSynthesize * attempts,
    detail: `Built a ${plan.length}-day plan (${attempts} attempt${attempts === 1 ? "" : "s"})`,
  };
}

// Previous COMPLETED run's deltas + prior-plan completion, for Day 1's Hinglish
// acknowledgement. Fully defensive — any missing piece just stays null.
async function loadPrior(
  admin: StageContext["admin"],
  run: StageContext["run"],
  selfValues: Record<string, SignalValue>,
  avgNow: number | null,
): Promise<PriorInput | null> {
  const { data: prevRun } = await admin
    .from("audit_runs")
    .select("id")
    .eq("clinic_id", run.clinic_id)
    .eq("status", "complete")
    .neq("id", run.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prevRun) return null;

  const { data: prevSelf } = await admin
    .from("audit_entities")
    .select("id")
    .eq("run_id", prevRun.id)
    .eq("entity_kind", "self")
    .maybeSingle();

  let avgPrev: number | null = null;
  let visPrev: number | null = null;
  let planCompleted = 0;
  let planTotal = 0;

  if (prevSelf) {
    const { data: prevSummary } = await admin
      .from("audit_summaries")
      .select("average_digital_score")
      .eq("run_id", prevRun.id)
      .eq("entity_id", prevSelf.id)
      .maybeSingle();
    avgPrev = prevSummary?.average_digital_score ?? null;

    const { data: prevGrid } = await admin
      .from("audit_signals")
      .select("metric_key, value_number")
      .eq("run_id", prevRun.id)
      .eq("entity_id", prevSelf.id)
      .eq("source", "grid");
    const gv: Record<string, SignalValue> = {};
    for (const g of (prevGrid ?? []) as { metric_key: string; value_number: number | null }[]) {
      gv[g.metric_key] = g.value_number;
    }
    visPrev = visFromValues(gv);
  }

  const { data: prevPlan } = await admin
    .from("audit_plans")
    .select("id")
    .eq("run_id", prevRun.id)
    .maybeSingle();
  if (prevPlan) {
    const { data: prevItems } = await admin
      .from("plan_items")
      .select("status")
      .eq("plan_id", prevPlan.id);
    const items = (prevItems ?? []) as { status: string }[];
    planTotal = items.length;
    planCompleted = items.filter((i) => i.status === "done").length;
  }

  return {
    plan_completed: planCompleted,
    plan_total: planTotal,
    avg_prev: avgPrev,
    avg_now: avgNow,
    visibility_prev: visPrev,
    visibility_now: visFromValues(selfValues),
  };
}
