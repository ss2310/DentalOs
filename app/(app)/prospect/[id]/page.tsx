import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { SectionHeader, EmptyState } from "@/components/page";
import { CompetitorTable } from "@/components/competitor-table";
import { Heatmap } from "@/components/heatmap";
import type { ProspectAudit } from "@/lib/types";
import { CopyLink } from "./copy-link";

export const dynamic = "force-dynamic";

export default async function AuditDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_agency")
    .eq("id", user.id)
    .single();
  if (!profile?.is_agency) redirect("/dashboard");

  // RLS scopes this to the caller's own audits (created_by = auth.uid()).
  const { data } = await supabase
    .from("prospect_audits")
    .select(
      "id, business_name, area, city, keyword, grid_points, avg_rank, pct_in_top3, competitors, findings, share_token, provider, created_at",
    )
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const audit = data as ProspectAudit;

  const gridSize = Math.round(Math.sqrt(audit.grid_points?.length ?? 0)) || 5;
  const summary = audit.competitors;
  const total = summary?.total_cells ?? audit.grid_points?.length ?? 0;

  return (
    <div>
      <Link
        href="/prospect"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Prospecting
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">
            {audit.business_name}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {[audit.area, audit.city].filter(Boolean).join(", ")}
            {audit.area || audit.city ? " · " : ""}“{audit.keyword}” ·{" "}
            {formatDate(audit.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyLink token={audit.share_token} />
          <Link
            href={`/prospect/${audit.id}/ai-visibility`}
            className="flex h-11 items-center justify-center rounded-button border border-border bg-white px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            Add AI Visibility results
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">Average Map Rank</p>
          <p className="mt-1 text-4xl font-semibold text-text-primary">
            {audit.avg_rank != null ? Number(audit.avg_rank).toFixed(1) : "—"}
          </p>
        </div>
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">In Top 3</p>
          <p className="mt-1 text-4xl font-semibold text-success">
            {audit.pct_in_top3 != null
              ? `${Math.round(Number(audit.pct_in_top3))}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* Grid — red/grey cells are the hook */}
      <SectionHeader>Map Rank Grid</SectionHeader>
      <Heatmap points={audit.grid_points ?? []} gridSize={gridSize} />

      {/* Competitor comparison (reused R2b table) */}
      <SectionHeader hint="Sorted by areas they win">
        Who&apos;s Winning Instead
      </SectionHeader>
      {summary ? (
        <CompetitorTable
          target={summary.target}
          rivals={summary.rivals}
          total={total}
          youLabel={audit.business_name ?? "This business"}
        />
      ) : (
        <EmptyState>No competitor data captured for this audit.</EmptyState>
      )}

      {/* Findings */}
      <SectionHeader>What&apos;s Holding Them Back</SectionHeader>
      {audit.findings && audit.findings.length > 0 ? (
        <ul className="space-y-2">
          {audit.findings.map((flag, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-card border border-border bg-white px-4 py-3 text-[15px] text-text-primary"
            >
              <span className="mt-0.5 text-danger">•</span>
              {flag}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>No findings generated.</EmptyState>
      )}
    </div>
  );
}
