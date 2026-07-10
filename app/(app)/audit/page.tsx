import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { PageHeader, SectionHeader, EmptyState } from "@/components/page";
import { formatDate } from "@/lib/format";
import { RunDeepAudit } from "./run-deep-audit";

export const dynamic = "force-dynamic";
// The audit page hosts the RunDeepAudit poller, which invokes the runAuditStage
// server action one stage per call. Stage 6 (synthesis) is a single long Claude
// generation (~2-3 min for the 30-day plan), so the segment's function timeout
// must cover it. 300s is the Vercel Pro ceiling; on Hobby (60s cap) synthesis
// would time out — the audit needs at least a Pro plan.
export const maxDuration = 300;

type RunRow = {
  id: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  stage_detail: string | null;
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  complete: { label: "Ready", cls: "bg-success/10 text-success" },
  failed: { label: "Failed", cls: "bg-danger/10 text-danger" },
};
const RUNNING = { label: "In progress", cls: "bg-warning/10 text-warning" };

export default async function AuditIndexPage() {
  const supabase = createClient();
  const isAdmin = isAdminRole(await getUserRole());

  const [{ data }, { data: clinic }, { data: pack }] = await Promise.all([
    supabase
      .from("audit_runs")
      .select("id, status, created_at, completed_at, stage_detail")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("clinics").select("deep_audit_credits, subscription_status").single(),
    supabase
      .from("credit_packs")
      .select("id")
      .eq("name", "Deep Audit Top-up")
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const runs = (data ?? []) as RunRow[];
  const latestComplete = runs.find((r) => r.status === "complete");
  const auditBalance = clinic?.deep_audit_credits ?? 0;
  const onTrial = clinic?.subscription_status === "trial";
  const extraAuditPackId = (pack?.id as string | undefined) ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Deep Audit"
        subtitle="See exactly what your top local competitors are doing better — and get a 30-day plan to catch up."
        action={
          isAdmin ? (
            <RunDeepAudit
              balance={auditBalance}
              onTrial={onTrial}
              extraAuditPackId={extraAuditPackId}
            />
          ) : undefined
        }
      />

      {latestComplete ? (
        <Link
          href={`/audit/report/${latestComplete.id}`}
          className="mt-6 flex items-center justify-between gap-3 rounded-card bg-primary p-5 shadow-card hover:bg-primary/95"
        >
          <div>
            <p className="text-sm font-medium text-white/75">Your latest plan</p>
            <p className="mt-1 text-[17px] font-semibold text-white">
              Open your 30-day growth plan →
            </p>
          </div>
        </Link>
      ) : null}

      <SectionHeader>History</SectionHeader>
      {runs.length === 0 ? (
        <EmptyState>
          No audits yet.{" "}
          {isAdmin
            ? "Run your first deep audit to see how you stack up."
            : "Ask your clinic owner to run the first deep audit."}
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-white">
          {runs.map((r, i) => {
            const badge =
              STATUS_BADGE[r.status] ??
              (r.status === "failed" ? STATUS_BADGE.failed : RUNNING);
            const clickable = r.status === "complete" || r.status === "failed";
            const inner = (
              <>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] text-text-primary">
                    {formatDate(r.completed_at ?? r.created_at)}
                  </p>
                  {r.stage_detail ? (
                    <p className="truncate text-sm text-text-secondary">
                      {r.stage_detail}
                    </p>
                  ) : null}
                </div>
                <span className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium ${badge.cls}`}>
                  {badge.label}
                </span>
              </>
            );
            return clickable ? (
              <Link
                key={r.id}
                href={`/audit/report/${r.id}`}
                className={`flex items-center gap-3 px-4 py-3.5 hover:bg-subtle ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                {inner}
              </Link>
            ) : (
              <div
                key={r.id}
                className={`flex items-center gap-3 px-4 py-3.5 ${
                  i > 0 ? "border-t border-border" : ""
                }`}
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
