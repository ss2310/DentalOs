import type { LocalResult } from "./types";
import { normalizeName } from "./match";
import type {
  CompetitorSummary,
  CompetitorRow,
  CompetitorCell,
} from "@/lib/types";

// Builds the competitor aggregate for one scan from the top-N local results the
// SERP provider already returned at each grid point. Pure and provider-agnostic
// — no network, no DB — so the /competitors feature adds zero API cost. Called
// once during runScan; the result is stored on rank_scans.competitors.

export type ScanCellInput = {
  lat: number;
  lng: number;
  // The target's rank at this cell, as already matched during the scan
  // (keeps identity consistent with the heatmap's grid_points).
  targetRank: number | null;
  top: LocalResult[]; // top ~10 results at this cell
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function buildCompetitorSummary(
  cells: ScanCellInput[],
  targetBusinessName: string,
): CompetitorSummary {
  const target = normalizeName(targetBusinessName);

  type Acc = {
    name: string; // first-seen display name
    rankSum: number;
    cellsPresent: number;
    beating: number;
    top3: number;
    reviews: number | null;
    rating: number | null;
    hasWebsite: boolean;
  };
  const accs = new Map<string, Acc>();

  // Target's own profile — taken from the cell where its listing is richest
  // (most reviews). Ranks come from targetRank, not the top list.
  let tReviews: number | null = null;
  let tRating: number | null = null;
  let tWebsite = false;
  let tRankSum = 0;
  let tPresent = 0;
  let tTop3 = 0;

  const outCells: CompetitorCell[] = [];
  let totalTop3Slots = 0;

  for (const cell of cells) {
    const yourRank = cell.targetRank;
    if (yourRank != null) {
      tRankSum += yourRank;
      tPresent++;
      if (yourRank <= 3) tTop3++;
    }

    let leaderName: string | null = null;
    let leaderRank = Infinity;

    for (const r of cell.top) {
      const norm = normalizeName(r.name);
      if (!norm) continue;

      // Fuzzy target match (mirrors match.ts). Guard against an empty target
      // name, which would otherwise substring-match every result.
      const isTarget =
        target.length > 0 &&
        (norm === target || norm.includes(target) || target.includes(norm));

      if (r.rank <= 3) totalTop3Slots++;

      if (isTarget) {
        if ((r.reviews_count ?? -1) > (tReviews ?? -1)) {
          tReviews = r.reviews_count;
          tRating = r.rating;
        }
        if (r.has_website) tWebsite = true;
        continue;
      }

      // Competitor.
      const a =
        accs.get(norm) ??
        ({
          name: r.name,
          rankSum: 0,
          cellsPresent: 0,
          beating: 0,
          top3: 0,
          reviews: null,
          rating: null,
          hasWebsite: false,
        } satisfies Acc);
      a.rankSum += r.rank;
      a.cellsPresent++;
      if (r.rank <= 3) a.top3++;
      if ((r.reviews_count ?? -1) > (a.reviews ?? -1)) {
        a.reviews = r.reviews_count;
        a.rating = r.rating;
      }
      if (r.has_website) a.hasWebsite = true;
      // Beats you here if you're absent, or they outrank you.
      if (yourRank == null || r.rank < yourRank) a.beating++;
      accs.set(norm, a);

      if (r.rank < leaderRank) {
        leaderRank = r.rank;
        leaderName = r.name;
      }
    }

    // Gap-map classification for this cell.
    let state: CompetitorCell["state"];
    if (yourRank != null && yourRank <= 3) state = "win";
    else if (yourRank != null) state = "behind";
    else if (leaderName != null) state = "absent";
    else state = "empty";

    outCells.push({
      lat: cell.lat,
      lng: cell.lng,
      your_rank: yourRank,
      leader_name: leaderName,
      state,
    });
  }

  const rivals: CompetitorRow[] = Array.from(accs.values())
    .map((a) => ({
      name: a.name,
      avg_rank: a.cellsPresent > 0 ? round1(a.rankSum / a.cellsPresent) : null,
      reviews_count: a.reviews,
      rating: a.rating,
      has_website: a.hasWebsite,
      cells_beating_target: a.beating,
      cells_present: a.cellsPresent,
      top3_cells: a.top3,
    }))
    .sort(
      (x, y) =>
        y.cells_beating_target - x.cells_beating_target ||
        y.cells_present - x.cells_present ||
        (x.avg_rank ?? 99) - (y.avg_rank ?? 99),
    );

  return {
    total_cells: cells.length,
    target: {
      avg_rank: tPresent > 0 ? round1(tRankSum / tPresent) : null,
      reviews_count: tReviews,
      rating: tRating,
      has_website: tWebsite,
      top3_cells: tTop3,
    },
    rivals,
    total_top3_slots: totalTop3Slots,
    cells: outCells,
  };
}
