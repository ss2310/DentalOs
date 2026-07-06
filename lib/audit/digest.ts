import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { visibilityScore } from "@/lib/audit/scoring.mjs";
import { competitorWatch, deltaDigestMessage } from "@/lib/audit/recurring.mjs";
import type { AuditRun } from "@/lib/audit/types";

// Delta digest: on completion of any run #2+ (a prior completed run exists),
// compose a CAUSE → EFFECT → NEXT Hinglish update — what they completed, what
// moved, what a competitor did, and the new plan's Day-1 action — as an in-app
// notification + a stored one-tap WhatsApp message. Single-fire via
// audit_runs.digest_sent_at. Never throws into the pipeline (best-effort).

type Ent = { id: string; entity_kind: "self" | "competitor"; display_name: string | null };

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

async function visibilityFor(
  admin: SupabaseClient,
  runId: string,
  entityId: string,
): Promise<number | null> {
  const { data } = await admin
    .from("audit_signals")
    .select("metric_key, value_number")
    .eq("run_id", runId)
    .eq("entity_id", entityId)
    .eq("source", "grid");
  const pins: Record<string, number | null> = {};
  for (const s of (data ?? []) as { metric_key: string; value_number: number | null }[]) {
    pins[s.metric_key] = s.value_number;
  }
  return visibilityScore({
    total_pins: pins.total_pins ?? null,
    green_pins: pins.green_pins ?? null,
    yellow_pins: pins.yellow_pins ?? null,
    red_pins: pins.red_pins ?? null,
    out_pins: pins.out_pins ?? null,
  });
}

export async function maybeSendDeltaDigest(
  admin: SupabaseClient,
  run: AuditRun,
): Promise<boolean> {
  // Idempotency: only ever one digest per run.
  const { data: cur } = await admin
    .from("audit_runs")
    .select("id, clinic_id, digest_sent_at")
    .eq("id", run.id)
    .maybeSingle();
  if (!cur || cur.digest_sent_at) return false;

  // Needs a prior completed run — run #1 gets no digest.
  const { data: prev } = await admin
    .from("audit_runs")
    .select("id")
    .eq("clinic_id", run.clinic_id)
    .eq("status", "complete")
    .neq("id", run.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!prev) return false;

  const { data: entsCur } = await admin
    .from("audit_entities")
    .select("id, entity_kind, display_name")
    .eq("run_id", run.id);
  const ents = (entsCur ?? []) as Ent[];
  const self = ents.find((e) => e.entity_kind === "self");
  const competitors = ents.filter((e) => e.entity_kind === "competitor");
  if (!self) return false;

  const { data: prevSelf } = await admin
    .from("audit_entities")
    .select("id")
    .eq("run_id", prev.id)
    .eq("entity_kind", "self")
    .maybeSingle();

  // EFFECT — score + visibility deltas.
  const scoreNow = await selfScore(admin, run.id, self.id);
  const scorePrev = prevSelf ? await selfScore(admin, prev.id, prevSelf.id as string) : null;
  const visNow = await visibilityFor(admin, run.id, self.id);
  const visPrev = prevSelf ? await visibilityFor(admin, prev.id, prevSelf.id as string) : null;

  // CAUSE — how many actions they completed on the prior plan.
  const completedCount = await priorDone(admin, prev.id);

  // Competitor watch — review-velocity of self vs each rival on THIS run.
  const velMap = await velocities(admin, run.id);
  const rivals = competitors.map((c) => ({
    name: c.display_name ?? "A competitor",
    velocity: velMap[c.id] ?? null,
  }));
  const watch = competitorWatch(velMap[self.id] ?? null, rivals);

  // NEXT — the new plan's Day-1 action.
  const day1Title = await dayOneTitle(admin, run.id);

  const reportUrl = `${appUrl()}/audit/report/${run.id}`;
  const message = deltaDigestMessage({
    completedCount,
    visPrev: visPrev == null ? null : Math.round(visPrev),
    visNow: visNow == null ? null : Math.round(visNow),
    scorePrev,
    scoreNow,
    watch,
    day1Title,
    reportUrl,
  });

  // Stamp first (single-fire even if the notification RPC hiccups).
  const { data: stamped } = await admin
    .from("audit_runs")
    .update({ digest_sent_at: new Date().toISOString(), digest_wa_message: message })
    .eq("id", run.id)
    .is("digest_sent_at", null)
    .select("id")
    .maybeSingle();
  if (!stamped) return false; // lost the race — someone already sent it

  await admin.rpc("create_notification", {
    p_clinic_id: run.clinic_id,
    p_type: "system",
    p_priority: "important",
    p_title: "Your new 30-day growth plan is ready 📈",
    p_body: message,
    p_action_url: `/audit/report/${run.id}`,
  });
  return true;
}

async function selfScore(admin: SupabaseClient, runId: string, entityId: string) {
  const { data } = await admin
    .from("audit_summaries")
    .select("average_digital_score")
    .eq("run_id", runId)
    .eq("entity_id", entityId)
    .maybeSingle();
  const v = data?.average_digital_score;
  return v == null ? null : Math.round(Number(v));
}

async function priorDone(admin: SupabaseClient, prevRunId: string): Promise<number | null> {
  const { data: plan } = await admin
    .from("audit_plans")
    .select("id")
    .eq("run_id", prevRunId)
    .maybeSingle();
  if (!plan) return null;
  const { count } = await admin
    .from("plan_items")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", plan.id)
    .eq("status", "done");
  return count ?? 0;
}

async function dayOneTitle(admin: SupabaseClient, runId: string): Promise<string | null> {
  const { data: plan } = await admin
    .from("audit_plans")
    .select("id")
    .eq("run_id", runId)
    .maybeSingle();
  if (!plan) return null;
  const { data: item } = await admin
    .from("plan_items")
    .select("title, day_number")
    .eq("plan_id", plan.id)
    .order("day_number", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (item?.title as string | undefined) ?? null;
}

// review_velocity_computed per entity for a run → { entity_id: velocity }.
async function velocities(
  admin: SupabaseClient,
  runId: string,
): Promise<Record<string, number | null>> {
  const { data } = await admin
    .from("audit_signals")
    .select("entity_id, value_number")
    .eq("run_id", runId)
    .eq("metric_key", "review_velocity_computed");
  const out: Record<string, number | null> = {};
  for (const s of (data ?? []) as { entity_id: string; value_number: number | null }[]) {
    out[s.entity_id] = s.value_number;
  }
  return out;
}
