import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { stageDiscover } from "@/lib/audit/stages/discover";
import { stageGbpPull } from "@/lib/audit/stages/gbp";
import { stageWebPull } from "@/lib/audit/stages/web";
import { stageAiQueries } from "@/lib/audit/stages/ai_queries";
import { stageScoring } from "@/lib/audit/stages/scoring";
import { stageSynthesize } from "@/lib/audit/stages/synthesize";
import type { AuditRun, StageContext, StageResult } from "@/lib/audit/types";

// The Deep Audit stage machine. Ordered registry; the runAuditStage server
// action advances audit_runs.status one stage per call and is resumable via
// stage_cursor (the last COMPLETED stage). Stages 4–6 (ai_queries, scoring,
// synthesizing) append here later — the runner needs no other change.

type Stage = {
  key: string;
  status: string; // audit_runs.status while this stage runs
  run: (ctx: StageContext) => Promise<StageResult>;
};

export const STAGES: Stage[] = [
  { key: "discover", status: "discovering", run: stageDiscover },
  { key: "gbp", status: "collecting", run: stageGbpPull },
  { key: "web", status: "collecting", run: stageWebPull },
  { key: "ai_queries", status: "ai_queries", run: stageAiQueries }, // Stage 4
  { key: "scoring", status: "scoring", run: stageScoring }, // Stage 5
  { key: "synthesize", status: "synthesizing", run: stageSynthesize }, // Stage 6
];

// Index of the NEXT stage to run given the last-completed cursor.
export function nextStageIndex(cursor: string | null): number {
  if (!cursor) return 0;
  const i = STAGES.findIndex((s) => s.key === cursor);
  return i === -1 ? 0 : i + 1;
}

export type RunStageOutcome = {
  ran: boolean; // false when there are no more IMPLEMENTED stages
  done: boolean; // true when the last implemented stage just finished
  status: string;
  stageKey?: string;
  detail?: string;
};

// Runs EXACTLY ONE stage (the next after the cursor), updating the run's status,
// cursor, detail, and accumulated cost. Throws on stage failure — the caller
// marks the run 'failed' and decides on retry / slot release.
export async function runNextStage(
  admin: SupabaseClient,
  run: AuditRun,
): Promise<RunStageOutcome> {
  const idx = nextStageIndex(run.stage_cursor);
  if (idx >= STAGES.length) {
    // Stages 1–3 done; later stages not built yet. Nothing to do.
    return { ran: false, done: true, status: run.status };
  }

  const stage = STAGES[idx];

  // Mark in-progress so a poller sees movement even mid-stage.
  // stage_started_at (migration 048) is the liveness heartbeat the rescue
  // cron uses to tell an ACTIVE run (stamp < 8 min old — a stage can't run
  // longer than the 5-min function cap) from an ABANDONED one (tab closed).
  // Retry without it if 048 isn't applied yet, so runs never break mid-rollout.
  const inProgress = {
    status: stage.status,
    stage_detail: `Running: ${stage.key}`,
    stage_started_at: new Date().toISOString(),
  };
  const { error: markErr } = await admin
    .from("audit_runs")
    .update(inProgress)
    .eq("id", run.id);
  if (
    markErr &&
    (markErr.code === "PGRST204" || /stage_started_at/i.test(markErr.message ?? ""))
  ) {
    await admin
      .from("audit_runs")
      .update({ status: stage.status, stage_detail: `Running: ${stage.key}` })
      .eq("id", run.id);
  }

  const result = await stage.run({ admin, run }); // may throw

  const isLastImplemented = idx + 1 >= STAGES.length;
  const newCost = Number(run.est_api_cost_inr ?? 0) + result.costInr;
  // The final stage (synthesize) transitions the run to a terminal 'complete'
  // and stamps completed_at (the review-velocity baseline for the next audit).
  await admin
    .from("audit_runs")
    .update({
      status: isLastImplemented ? "complete" : stage.status,
      stage_cursor: stage.key,
      stage_detail: result.detail,
      est_api_cost_inr: newCost,
      ...(isLastImplemented ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", run.id);

  // On completion, fire the delta digest for run #2+ (best-effort — a digest
  // failure must never fail the run). Covers BOTH the manual browser poller and
  // the cron runner, since both reach completion here.
  if (isLastImplemented) {
    try {
      const { maybeSendDeltaDigest } = await import("@/lib/audit/digest");
      await maybeSendDeltaDigest(admin, run);
    } catch (err) {
      console.error("[run] delta digest failed:", err instanceof Error ? err.message : err);
    }
  }

  return {
    ran: true,
    done: isLastImplemented,
    status: isLastImplemented ? "complete" : stage.status,
    stageKey: stage.key,
    detail: result.detail,
  };
}
