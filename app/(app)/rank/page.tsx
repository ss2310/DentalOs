import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { formatDate } from "@/lib/format";
import { getScanBudget } from "@/lib/serp/budget";
import { isLiveProvider } from "@/lib/serp";
import { SampleDataBanner } from "./sample-banner";
import {
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import type { RankKeyword } from "@/lib/types";
import { RankToolbar } from "./rank-toolbar";

export const dynamic = "force-dynamic";

type KeywordRow = Pick<
  RankKeyword,
  "id" | "keyword" | "target_business_name" | "grid_size"
>;

type ScanRow = {
  keyword_id: string;
  avg_rank: string | null;
  pct_in_top3: string | null;
  scanned_at: string;
};

export default async function RankPage() {
  await requireAdmin();
  const supabase = createClient();

  const [{ data: kwData }, { data: scanData }, { data: clinic }, budget] =
    await Promise.all([
      supabase
        .from("rank_tracking_keywords")
        .select("id, keyword, target_business_name, grid_size")
        .order("created_at", { ascending: false }),
      supabase
        .from("rank_scans")
        .select("keyword_id, avg_rank, pct_in_top3, scanned_at")
        .eq("status", "complete")
        .order("scanned_at", { ascending: false }),
      supabase
        .from("clinics")
        .select("business_name, default_lat, default_lng")
        .single(),
      getScanBudget(supabase),
    ]);

  const keywords = (kwData as KeywordRow[]) ?? [];
  const scans = (scanData as ScanRow[]) ?? [];
  const hasLocation =
    clinic?.default_lat != null && clinic?.default_lng != null;

  // Latest scan per keyword (scans already sorted newest-first).
  const latest = new Map<string, ScanRow>();
  for (const s of scans) {
    if (!latest.has(s.keyword_id)) latest.set(s.keyword_id, s);
  }

  const scanned = keywords
    .map((k) => latest.get(k.id))
    .filter((s): s is ScanRow => !!s);
  const avgRank =
    scanned.length > 0
      ? (
          scanned.reduce((s, r) => s + Number(r.avg_rank ?? 0), 0) /
          scanned.length
        ).toFixed(1)
      : "—";
  const avgTop3 =
    scanned.length > 0
      ? Math.round(
          scanned.reduce((s, r) => s + Number(r.pct_in_top3 ?? 0), 0) /
            scanned.length,
        )
      : 0;

  return (
    <div>
      <RankToolbar
        defaultBusiness={clinic?.business_name ?? ""}
        hasLocation={hasLocation}
      />
      <p className="mt-1 text-sm text-text-secondary">
        Track where you rank on Google Maps across a grid of nearby points ·
        This month: {budget.used}/{budget.cap} scans used
      </p>

      {!hasLocation ? (
        <div className="mt-4 rounded-card border border-warning/30 bg-warning/5 p-4">
          <p className="text-[15px] font-medium text-text-primary">
            Set your clinic location to start tracking
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Map Rank scans centre on your clinic’s location. Set it once in
            Settings — you won’t need to enter coordinates again.
          </p>
          <Link
            href="/settings"
            className="mt-3 inline-flex h-10 items-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
          >
            Go to Settings
          </Link>
        </div>
      ) : null}

      {!isLiveProvider() ? <SampleDataBanner /> : null}

      <StatGrid>
        <StatCard label="Keywords Tracked" value={String(keywords.length)} />
        <StatCard label="Avg Map Rank" value={avgRank} tone="primary" />
        <StatCard label="In Top 3" value={`${avgTop3}%`} tone="success" />
      </StatGrid>

      <SectionHeader hint="Newest first">Tracked Keywords</SectionHeader>

      <div>
        {keywords.length === 0 ? (
          <EmptyState>
            No keywords yet. Add one to start tracking your Map rank.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {keywords.map((k) => {
              const s = latest.get(k.id);
              return (
                <Link
                  key={k.id}
                  href={`/rank/${k.id}`}
                  className="block rounded-card border border-border bg-white p-4 hover:bg-subtle"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-text-primary">
                        {k.keyword}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-text-secondary">
                        {k.target_business_name} · {k.grid_size}×{k.grid_size}{" "}
                        grid
                      </p>
                    </div>
                    <div className="text-right">
                      {s ? (
                        <>
                          <p className="text-[15px] font-semibold text-text-primary">
                            Avg {Number(s.avg_rank).toFixed(1)}
                          </p>
                          <p className="mt-0.5 text-sm text-text-secondary">
                            {Math.round(Number(s.pct_in_top3))}% top-3 ·{" "}
                            {formatDate(s.scanned_at)}
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-text-secondary">
                          Not scanned yet
                        </p>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
