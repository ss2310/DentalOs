import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { isLiveProvider } from "@/lib/serp";
import {
  PageHeader,
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import type {
  RankKeyword,
  CompetitorSummary,
  CompetitorRow,
  CompetitorTarget,
} from "@/lib/types";
import { CompetitorTable } from "@/components/competitor-table";
import { SampleDataBanner } from "../rank/sample-banner";
import { KeywordPicker } from "./keyword-picker";
import { GapMap } from "./gap-map";
import { CopySummary } from "./copy-summary";

export const dynamic = "force-dynamic";

type KeywordRow = Pick<
  RankKeyword,
  "id" | "keyword" | "target_business_name" | "grid_size"
>;

type ScanRow = {
  id: string;
  scanned_at: string;
  competitors: CompetitorSummary | null;
};

const num = (n: number | null, digits = 1) =>
  n == null ? "—" : n.toFixed(digits);
const int = (n: number | null) => (n == null ? "—" : String(n));

export default async function CompetitorsPage({
  searchParams,
}: {
  searchParams: { k?: string };
}) {
  const supabase = createClient();

  const { data: kwData } = await supabase
    .from("rank_tracking_keywords")
    .select("id, keyword, target_business_name, grid_size")
    .order("created_at", { ascending: false });
  const keywords = (kwData as KeywordRow[]) ?? [];

  // No keywords at all → nothing has ever been scanned.
  if (keywords.length === 0) {
    return (
      <div>
        <PageHeader
          title="Competitors"
          subtitle="See who's beating you on Google Maps — and exactly where."
        />
        <SectionHeader>Competitor Analysis</SectionHeader>
        <EmptyState>
          Run a Map Rank scan first — competitor data comes from it.{" "}
          <Link href="/rank" className="font-medium text-primary hover:underline">
            Go to Map Rank →
          </Link>
        </EmptyState>
      </div>
    );
  }

  const selected =
    keywords.find((k) => k.id === searchParams.k) ?? keywords[0];

  const { data: scanData } = await supabase
    .from("rank_scans")
    .select("id, scanned_at, competitors")
    .eq("keyword_id", selected.id)
    .order("scanned_at", { ascending: false });

  // Only scans created since migration 008 carry the competitor aggregate.
  const scans = ((scanData as ScanRow[]) ?? []).filter(
    (s): s is ScanRow & { competitors: CompetitorSummary } =>
      !!s.competitors && Array.isArray(s.competitors.cells),
  );
  const latest = scans[0] ?? null;

  const picker = (
    <KeywordPicker
      options={keywords.map((k) => ({ id: k.id, label: k.keyword }))}
      selectedId={selected.id}
    />
  );

  if (!latest) {
    return (
      <div>
        <PageHeader
          title="Competitors"
          subtitle="See who's beating you on Google Maps — and exactly where."
        />
        <div className="mt-5">{picker}</div>
        {!isLiveProvider() ? <SampleDataBanner /> : null}
        <SectionHeader>Competitor Analysis</SectionHeader>
        <EmptyState>
          Run a Map Rank scan first — competitor data comes from it.{" "}
          <Link
            href={`/rank/${selected.id}`}
            className="font-medium text-primary hover:underline"
          >
            Scan &quot;{selected.keyword}&quot; →
          </Link>
        </EmptyState>
      </div>
    );
  }

  const summary = latest.competitors!;
  const total = summary.total_cells;
  const t = summary.target;
  const rivals = summary.rivals;
  const gridSize = selected.grid_size;

  // #1 threat = the rival that beats you in the most areas.
  const threat = rivals[0] && rivals[0].cells_beating_target > 0 ? rivals[0] : null;

  // Share of local pack: you vs the 5 rivals with the most top-3 appearances.
  const packRivals = [...rivals]
    .sort((a, b) => b.top3_cells - a.top3_cells)
    .slice(0, 5);
  const packDenom = summary.total_top3_slots || 1;

  // Gap-map tallies.
  const absentCount = summary.cells.filter((c) => c.state === "absent").length;
  const winCount = summary.cells.filter((c) => c.state === "win").length;

  // Trend: cells_beating_target over scans (oldest → newest) for the top 3
  // threats. Only meaningful with more than one scan on record.
  const topThree = rivals.slice(0, 3);
  const chronological = [...scans].reverse();
  const trend = topThree.map((r) => ({
    name: r.name,
    latest: r.cells_beating_target,
    series: chronological.map((s) => {
      const match = s.competitors!.rivals.find((x) => x.name === r.name);
      const cells = s.competitors!.total_cells || total;
      return {
        beating: match?.cells_beating_target ?? 0,
        total: cells,
        at: s.scanned_at,
      };
    }),
  }));

  const copyText = buildCopyText(selected, t, threat, rivals, total, absentCount);

  return (
    <div>
      <PageHeader
        title="Competitors"
        subtitle={`${selected.keyword} · ${selected.target_business_name}`}
        action={<CopySummary text={copyText} />}
      />

      <div className="mt-5">{picker}</div>
      <p className="mt-2 text-sm text-text-secondary">
        From your scan on {formatDate(latest.scanned_at)} ·{" "}
        {latest.competitors!.total_cells} map areas · reads stored scan data (no
        new API calls)
      </p>

      {!isLiveProvider() ? <SampleDataBanner /> : null}

      {/* Quick position stats */}
      <StatGrid>
        <StatCard
          label="You're top-3 in"
          value={`${winCount}/${total}`}
          hint="map areas"
          tone={winCount > total / 2 ? "success" : "warning"}
        />
        <StatCard
          label="Your avg Map rank"
          value={num(t.avg_rank)}
          hint="where you appear"
          tone="primary"
        />
        <StatCard
          label="Rivals found"
          value={String(rivals.length)}
          hint="near your clinic"
        />
      </StatGrid>

      {/* 2. Biggest threat */}
      <SectionHeader>Your Biggest Threat</SectionHeader>
      {threat ? (
        <ThreatCard threat={threat} target={t} total={total} />
      ) : (
        <div className="rounded-card border border-success/30 bg-success/5 p-5">
          <p className="text-[15px] font-semibold text-success">
            No rival is beating you.
          </p>
          <p className="mt-1 text-sm text-text-primary">
            Across all {total} map areas in this scan, no competitor consistently
            outranks you. Keep scanning to hold your lead.
          </p>
        </div>
      )}

      {/* 3. Head-to-head table */}
      <SectionHeader hint="Sorted by areas they beat you">
        You vs Competitors
      </SectionHeader>
      <CompetitorTable
        target={t}
        rivals={rivals}
        total={total}
        youLabel={`You (${selected.target_business_name})`}
      />

      {/* 4. Share of local pack */}
      <SectionHeader hint="Top-3 positions across the grid">
        Share of Local Pack
      </SectionHeader>
      <div className="rounded-card border border-border bg-white p-5">
        <div className="space-y-3">
          <ShareBar
            label={`You (${selected.target_business_name})`}
            count={t.top3_cells}
            denom={packDenom}
            you
          />
          {packRivals.map((r) => (
            <ShareBar
              key={r.name}
              label={r.name}
              count={r.top3_cells}
              denom={packDenom}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-text-secondary">
          Share of every top-3 Map slot across the {total} scanned areas.
        </p>
      </div>

      {/* 5. Gap map */}
      <SectionHeader hint={`${absentCount} areas you're missing from`}>
        Gap Map
      </SectionHeader>
      <GapMap cells={summary.cells} gridSize={gridSize} />

      {/* 6. Trend */}
      {scans.length > 1 ? (
        <>
          <SectionHeader hint="Areas they beat you, over time">
            Are Rivals Gaining?
          </SectionHeader>
          <div className="space-y-3">
            {trend.map((tr) => (
              <div
                key={tr.name}
                className="rounded-card border border-border bg-white p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-[15px] font-medium text-text-primary">
                    {tr.name}
                  </span>
                  <span className="shrink-0 text-sm text-text-secondary">
                    now beats you in {tr.latest}/{total}
                  </span>
                </div>
                <div className="mt-3 flex h-16 items-end gap-1.5">
                  {tr.series.map((pt, i) => {
                    const pct = Math.max((pt.beating / (pt.total || 1)) * 100, 3);
                    return (
                      <div
                        key={i}
                        className="flex flex-1 flex-col items-center justify-end"
                        title={`${formatDate(pt.at)} · beats you in ${pt.beating}/${pt.total}`}
                      >
                        <div
                          className="w-full rounded-t bg-danger/70"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-text-secondary">
            Oldest → newest. Taller bars = they beat you in more areas (they&apos;re
            gaining).
          </p>
        </>
      ) : null}
    </div>
  );
}

// ---- Sub-components (server-rendered, plain divs) ----

function ThreatCard({
  threat,
  target,
  total,
}: {
  threat: CompetitorRow;
  target: CompetitorTarget;
  total: number;
}) {
  const moreReviews =
    threat.reviews_count != null &&
    (target.reviews_count == null || threat.reviews_count > target.reviews_count);
  const betterRating =
    threat.rating != null &&
    (target.rating == null || threat.rating > target.rating);
  const websiteEdge = threat.has_website && !target.has_website;

  return (
    <div className="rounded-card border border-danger/30 bg-danger/5 p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-danger">
        Biggest threat
      </p>
      <p className="mt-1 text-xl font-semibold text-text-primary">
        {threat.name}
      </p>
      <p className="mt-1 text-[15px] text-text-primary">
        Beats you in{" "}
        <span className="font-semibold text-danger">
          {threat.cells_beating_target} of {total}
        </span>{" "}
        map areas.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CompareStat
          label="Reviews"
          them={int(threat.reviews_count)}
          you={int(target.reviews_count)}
          bad={moreReviews}
        />
        <CompareStat
          label="Rating"
          them={num(threat.rating)}
          you={num(target.rating)}
          bad={betterRating}
        />
        <CompareStat
          label="Website"
          them={threat.has_website ? "Yes" : "No"}
          you={target.has_website ? "Yes" : "No"}
          bad={websiteEdge}
        />
      </div>
      {websiteEdge ? (
        <p className="mt-3 text-sm font-medium text-warning">
          ⚠ They have a website and you don&apos;t — a quick win to close.
        </p>
      ) : null}
    </div>
  );
}

function CompareStat({
  label,
  them,
  you,
  bad,
}: {
  label: string;
  them: string;
  you: string;
  bad: boolean;
}) {
  return (
    <div className="rounded-button border border-border bg-white p-3">
      <p className="text-xs uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-[15px] text-text-primary">
        <span className={`font-semibold ${bad ? "text-danger" : ""}`}>
          {them}
        </span>{" "}
        <span className="text-text-secondary">· you {you}</span>
      </p>
    </div>
  );
}

function ShareBar({
  label,
  count,
  denom,
  you = false,
}: {
  label: string;
  count: number;
  denom: number;
  you?: boolean;
}) {
  const pct = Math.round((count / denom) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`truncate text-sm ${
            you ? "font-semibold text-primary" : "text-text-primary"
          }`}
        >
          {label}
        </span>
        <span className="shrink-0 text-sm text-text-secondary">{pct}%</span>
      </div>
      <div className="mt-1 h-3 w-full overflow-hidden rounded-pill bg-subtle">
        <div
          className={`h-full rounded-pill ${you ? "bg-primary" : "bg-text-secondary/50"}`}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>
    </div>
  );
}

// Plain-text summary for WhatsApp / reports. Built server-side; the client
// button just copies it.
function buildCopyText(
  keyword: KeywordRow,
  target: CompetitorTarget,
  threat: CompetitorRow | null,
  rivals: CompetitorRow[],
  total: number,
  absentCount: number,
): string {
  const lines: string[] = [];
  lines.push(`Competitor check — ${keyword.keyword}`);
  lines.push(`${keyword.target_business_name}`);
  lines.push("");
  lines.push(
    `Your position: top-3 in ${target.top3_cells}/${total} areas, avg rank ${num(
      target.avg_rank,
    )}.`,
  );
  lines.push("");

  const topThree = rivals.filter((r) => r.cells_beating_target > 0).slice(0, 3);
  if (topThree.length > 0) {
    lines.push("Top threats:");
    topThree.forEach((r, i) => {
      const bits = [`beats you in ${r.cells_beating_target}/${total} areas`];
      if (r.reviews_count != null) bits.push(`${r.reviews_count} reviews`);
      if (r.rating != null) bits.push(`${num(r.rating)}★`);
      lines.push(`${i + 1}. ${r.name} — ${bits.join(", ")}`);
    });
  } else {
    lines.push("No rival consistently outranks you. 🎉");
  }
  lines.push("");

  if (absentCount > 0) {
    lines.push(
      `Biggest gap: you don't show up in ${absentCount}/${total} map areas where rivals do${
        threat ? ` (worst: ${threat.name})` : ""
      }.`,
    );
  } else {
    lines.push("You appear across every scanned area — no coverage gaps.");
  }

  return lines.join("\n");
}
