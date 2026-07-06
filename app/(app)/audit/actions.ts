"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { DEEP_AUDIT_MONTHLY_LIMIT } from "@/lib/audit/config";
import { runNextStage } from "@/lib/audit/run";
import type { AuditRun } from "@/lib/audit/types";

export type AuditActionState = {
  ok?: boolean;
  error?: string;
  runId?: string;
  limit?: boolean; // allowance exhausted for the cycle
  status?: string;
  done?: boolean; // no more implemented stages (Stages 1–3 complete)
  detail?: string;
};

// Open a new deep audit: atomically consume one per-cycle allowance slot and
// create the run (start_deep_audit). Returns the runId the caller then drives
// stage-by-stage via runAuditStage. Owner/doctor only.
export async function startDeepAudit(): Promise<AuditActionState> {
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: runId, error } = await supabase.rpc("start_deep_audit", {
    p_limit: DEEP_AUDIT_MONTHLY_LIMIT,
  });
  if (error) {
    console.error("start_deep_audit failed:", error);
    return { error: "Could not start the audit. Please try again." };
  }
  if (!runId) {
    return {
      error: `You've used all ${DEEP_AUDIT_MONTHLY_LIMIT} deep audits included this cycle. Buying extra audits is coming soon.`,
      limit: true,
    };
  }

  revalidatePath("/audit");
  return { ok: true, runId: runId as string };
}

// Advance ONE pipeline stage for a run and return the new status. Resumable:
// calling again after a failure re-runs the failed stage (idempotent). The UI
// polls this until `done` (Stages 1–3 finished) or an error. Owner/doctor only.
export async function runAuditStage(runId: string): Promise<AuditActionState> {
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }
  const supabase = createClient();

  // RLS scopes this read to the caller's clinic — proves ownership before we
  // switch to the service-role client for the cross-cutting writes.
  const { data: owned } = await supabase
    .from("audit_runs")
    .select("id")
    .eq("id", runId)
    .maybeSingle();
  if (!owned) return { error: "Audit not found." };

  const admin = createAdminClient();
  // Reload through the no-store admin client so the cursor/cost are FRESH (the
  // user client's read can be served from Next's fetch cache across calls).
  const { data: run } = await admin
    .from("audit_runs")
    .select("id, clinic_id, status, stage_cursor, est_api_cost_inr, competitor_place_ids")
    .eq("id", runId)
    .single();
  if (!run) return { error: "Audit not found." };

  try {
    const res = await runNextStage(admin, run as AuditRun);
    revalidatePath("/audit");
    revalidatePath(`/audit/${runId}`);
    return { ok: true, status: res.status, done: res.done, detail: res.detail };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stage failed.";
    console.error("runAuditStage failed:", err);
    await admin
      .from("audit_runs")
      .update({ status: "failed", error: msg })
      .eq("id", runId);
    // Discovery never completed → the clinic got nothing; refund the allowance
    // slot (idempotent). A later-stage failure keeps the slot: the same run is
    // retryable for free (no re-consumption).
    if (!(run as AuditRun).stage_cursor) {
      await supabase.rpc("release_deep_audit", { p_run_id: runId });
    }
    revalidatePath("/audit");
    return { error: msg, status: "failed" };
  }
}
