import type { CompetitorSummary } from "@/lib/types";

// Turns an audit's competitor aggregate into short, plain-English flags shown
// to a prospect ("what's holding you back"). Pure — no network/DB — computed
// from data already in the aggregate, so it's deterministic and testable.

export function buildAuditFindings(params: {
  summary: CompetitorSummary;
  keyword: string;
  area: string;
  pctInTop3: number;
}): string[] {
  const { summary, keyword, area, pctInTop3 } = params;
  const total = summary.total_cells || 1;
  const t = summary.target;
  const where = area?.trim() || "the area";
  const findings: string[] = [];

  // 1. Invisibility — cells where the business isn't found at all.
  const notFound = summary.cells.filter((c) => c.your_rank == null).length;
  const notFoundPct = Math.round((notFound / total) * 100);
  if (notFoundPct > 0) {
    findings.push(
      `Not in the top 20 for “${keyword}” across ${notFoundPct}% of ${where}.`,
    );
  }

  // 2. Top-3 coverage.
  const top3Pct = Math.round(pctInTop3);
  findings.push(
    top3Pct > 0
      ? `Only appears in Google’s Top 3 across ${top3Pct}% of ${where}.`
      : `Never appears in Google’s Top 3 anywhere in ${where}.`,
  );

  // 3. Reviews gap vs the strongest rivals.
  const top5 = summary.rivals.slice(0, 5);
  const yourReviews = t.reviews_count ?? 0;
  const moreReviewed = top5.filter((r) => (r.reviews_count ?? 0) > yourReviews);
  if (moreReviewed.length > 0) {
    const avgTheir = Math.round(
      moreReviewed.reduce((s, r) => s + (r.reviews_count ?? 0), 0) /
        moreReviewed.length,
    );
    findings.push(
      `${moreReviewed.length} of the top ${top5.length} competitors have more Google reviews (${avgTheir} on average vs your ${yourReviews}).`,
    );
  }

  // 4. Website gap on the map profile.
  if (!t.has_website) {
    findings.push("No website is listed on the Google Maps profile.");
  }

  // 5. Beaten by the strongest rival.
  const top = summary.rivals[0];
  if (top && top.cells_beating_target > 0) {
    const pct = Math.round((top.cells_beating_target / total) * 100);
    findings.push(`Beaten by ${top.name} in ${pct}% of the map grid.`);
  }

  return findings;
}
