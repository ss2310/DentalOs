"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { SearchIcon } from "@/components/icons";
import { startDeepAudit, runAuditStage } from "./actions";

// Drives the whole pipeline from the browser: startDeepAudit consumes an
// allowance slot, then we loop runAuditStage (ONE stage per call, resumable)
// showing live progress, and route to the report when it completes. The
// completion toast is the "in-app notification" — no separate infra needed.

// Friendly label per pipeline status.
const STAGE_LABEL: Record<string, string> = {
  queued: "Starting…",
  discovering: "Finding your top competitors…",
  collecting: "Reading Google profiles & websites…",
  ai_queries: "Testing AI answer engines…",
  scoring: "Scoring you vs your competitors…",
  synthesizing: "Writing your 30-day plan…",
  complete: "Done!",
};

// A generous stop so a wedged run can't loop forever (6 stages + retries).
const MAX_STEPS = 20;

export function RunDeepAudit({ limit }: { limit: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const [upsell, setUpsell] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setUpsell(null);
    setLabel(STAGE_LABEL.queued);

    const started = await startDeepAudit();
    if (started.error || !started.runId) {
      setRunning(false);
      setLabel(null);
      if (started.limit) setUpsell(started.error ?? "Allowance used up.");
      else toast(started.error ?? "Could not start the audit.");
      return;
    }
    const runId = started.runId;

    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await runAuditStage(runId);
      if (res.error) {
        setRunning(false);
        setLabel(null);
        toast(res.error);
        // A failed run still has a report route that explains + offers retry.
        router.push(`/audit/report/${runId}`);
        return;
      }
      setLabel(STAGE_LABEL[res.status ?? ""] ?? res.detail ?? "Working…");
      if (res.done) {
        toast("Your 30-day growth plan is ready 🎉");
        router.push(`/audit/report/${runId}`);
        return;
      }
    }

    // Ran out of steps without completing — surface it rather than hang.
    setRunning(false);
    setLabel(null);
    toast("The audit is taking longer than expected. Please try again.");
  }

  if (running) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-border bg-white px-5 py-4 shadow-card">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-[15px] text-text-primary">{label}</span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={run}
        className="flex h-11 items-center gap-2 rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
      >
        <SearchIcon width={16} height={16} />
        Run Deep Audit
      </button>
      <p className="mt-2 text-xs text-text-secondary">
        Included: up to {limit} deep audits per billing cycle.
      </p>
      {upsell ? (
        <p className="mt-2 text-sm font-medium text-warning">{upsell}</p>
      ) : null}
    </div>
  );
}
