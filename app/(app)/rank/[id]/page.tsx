import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { generateGrid, isLiveProvider } from "@/lib/serp";
import { getScanBudget } from "@/lib/serp/budget";
import { SectionHeader, EmptyState } from "@/components/page";
import { SampleDataBanner } from "../sample-banner";
import type { RankKeyword, RankScan } from "@/lib/types";
import { RunScan } from "./run-scan";
import { Heatmap } from "@/components/heatmap";
import { rankColor } from "@/components/rank-colors";

export const dynamic = "force-dynamic";

export default async function KeywordDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const supabase = createClient();

  const [{ data: kw }, { data: scanData }, budget] = await Promise.all([
    supabase
      .from("rank_tracking_keywords")
      .select(
        "id, keyword, target_business_name, target_place_id, center_lat, center_lng, grid_size, radius_km, is_active, created_at",
      )
      .eq("id", params.id)
      .maybeSingle(),
    supabase
      .from("rank_scans")
      .select(
        "id, keyword_id, scanned_at, avg_rank, pct_in_top3, grid_points, provider, requests_made, created_at",
      )
      .eq("keyword_id", params.id)
      .eq("status", "complete")
      .order("scanned_at", { ascending: false }),
    getScanBudget(supabase),
  ]);

  if (!kw) notFound();
  const keyword = kw as RankKeyword;
  const scans = (scanData as RankScan[]) ?? [];
  const latest = scans[0] ?? null;

  const pointCount = generateGrid(
    Number(keyword.center_lat),
    Number(keyword.center_lng),
    keyword.grid_size,
    Number(keyword.radius_km),
  ).length;

  return (
    <div>
      <Link
        href="/rank"
        className="text-sm font-medium text-primary hover:underline"
      >
        ← Map Rank
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-text-primary">
            {keyword.keyword}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {keyword.target_business_name} · {keyword.grid_size}×
            {keyword.grid_size} grid · {Number(keyword.radius_km)} km radius
          </p>
        </div>
        <RunScan
          keywordId={keyword.id}
          pointCount={pointCount}
          remaining={budget.remaining}
          cap={budget.cap}
        />
      </div>

      {!isLiveProvider() ? <SampleDataBanner /> : null}

      {latest ? (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-card border border-border bg-white p-5">
              <p className="text-sm text-text-secondary">Average Map Rank</p>
              <p className="mt-1 text-4xl font-semibold text-text-primary">
                {Number(latest.avg_rank).toFixed(1)}
              </p>
            </div>
            <div className="rounded-card border border-border bg-white p-5">
              <p className="text-sm text-text-secondary">In Top 3</p>
              <p className="mt-1 text-4xl font-semibold text-success">
                {Math.round(Number(latest.pct_in_top3))}%
              </p>
            </div>
          </div>
          <p className="mt-2 text-sm text-text-secondary">
            Scanned {formatDate(latest.scanned_at)} ·{" "}
            {latest.provider === "mock" ? "sample data" : latest.provider} ·{" "}
            {latest.requests_made} requests
          </p>

          <SectionHeader>Rank Heatmap</SectionHeader>
          <Heatmap
            points={latest.grid_points ?? []}
            gridSize={keyword.grid_size}
          />
        </>
      ) : (
        <>
          <SectionHeader>Rank Heatmap</SectionHeader>
          <EmptyState>No scans yet. Run your first scan above.</EmptyState>
        </>
      )}

      {/* History */}
      <SectionHeader hint="Newest first">Scan History</SectionHeader>
      {scans.length === 0 ? (
        <EmptyState>No scans recorded yet.</EmptyState>
      ) : (
        <>
          {/* Plain-div trend: oldest → newest, taller = better (lower) rank */}
          <div className="rounded-card border border-border bg-white p-5">
            <div className="flex h-32 items-end gap-2">
              {[...scans]
                .reverse()
                .slice(-24)
                .map((s) => {
                  const avg = Number(s.avg_rank ?? 21);
                  const heightPct = Math.max(((21 - avg) / 20) * 100, 4);
                  return (
                    <div
                      key={s.id}
                      className="flex flex-1 flex-col items-center justify-end"
                      title={`${formatDate(s.scanned_at)} · avg ${avg.toFixed(1)}`}
                    >
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${heightPct}%`,
                          backgroundColor: rankColor(Math.round(avg)),
                        }}
                      />
                    </div>
                  );
                })}
            </div>
            <p className="mt-2 text-center text-xs text-text-secondary">
              Taller bars = better (lower) average rank
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {scans.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-card border border-border bg-white px-4 py-3"
              >
                <span className="text-sm text-text-secondary">
                  {formatDate(s.scanned_at)}
                </span>
                <span className="text-[15px] text-text-primary">
                  Avg{" "}
                  <span className="font-semibold">
                    {Number(s.avg_rank).toFixed(1)}
                  </span>{" "}
                  · {Math.round(Number(s.pct_in_top3))}% top-3
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
