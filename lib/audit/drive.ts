import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { runNextStage, type RunStageOutcome } from "@/lib/audit/run";
import type { AuditRun } from "@/lib/audit/types";

// Server-side (no browser) run driving for the recurring engine — the same
// per-stage progression the browser poller uses (runAuditStage), but invoked by
// the cron runner with the service-role admin client.

const RUN_COLS =
  "id, clinic_id, status, stage_cursor, est_api_cost_inr, competitor_place_ids";

// Open + tag an auto re-audit for a clinic. Consumes 1 deep_audit_credit via the
// service-role core (open_deep_audit); returns the runId, or null when the clinic
// has no credit left (caller sends the top-up nudge instead).
export async function enqueueAutoRun(
  admin: SupabaseClient,
  clinicId: string,
): Promise<string | null> {
  const { data: runId, error } = await admin.rpc("open_deep_audit", {
    p_clinic_id: clinicId,
  });
  if (error) throw new Error(`open_deep_audit failed: ${error.message}`);
  if (!runId) return null; // no included/purchased audit left

  const { error: tagErr } = await admin
    .from("audit_runs")
    .update({ trigger: "auto" })
    .eq("id", runId as string);
  if (tagErr) throw new Error(`could not tag auto run: ${tagErr.message}`);
  return runId as string;
}

// Advance ONE stage of a run (keeps each cron invocation well under the function
// limit). Marks the run 'failed' on a stage error and, when discovery itself
// failed (nothing delivered), refunds the consumed credit via the run-scoped
// service-role release. The delta digest fires from runNextStage's completion
// branch, so both manual and auto runs digest.
export async function advanceOneStage(
  admin: SupabaseClient,
  runId: string,
): Promise<RunStageOutcome | null> {
  const { data: run } = await admin
    .from("audit_runs")
    .select(RUN_COLS)
    .eq("id", runId)
    .single();
  if (!run) return null;

  try {
    return await runNextStage(admin, run as AuditRun);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stage failed.";
    await admin.from("audit_runs").update({ status: "failed", error: msg }).eq("id", runId);
    // Discovery never completed → refund the credit (idempotent via slot_released).
    if (!(run as AuditRun).stage_cursor) {
      await admin.rpc("release_deep_audit_run", { p_run_id: runId });
    }
    throw err;
  }
}

// The oldest still-running auto run (queued or mid-pipeline), for the runner to
// advance one stage. Oldest-first so an enqueued batch drains in order.
export async function nextAutoRunId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("audit_runs")
    .select("id")
    .eq("trigger", "auto")
    .not("status", "in", "(complete,failed)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
