import "server-only";

import {
  getSerpProvider,
  generateGrid,
  NOT_FOUND_RANK,
  buildCompetitorSummary,
} from "@/lib/serp";
import type { LocalResult } from "@/lib/serp";
import type { CompetitorSummary } from "@/lib/types";

// The CHARGELESS core of a grid rank scan: grid → provider loop → aggregate →
// competitor summary. No credits, no DB, no cap — pure compute + SERP calls.
// runScan (app/(app)/rank/actions.ts) wraps this with the 1-map-credit spend +
// reservation; the Deep Audit's Stage 1 calls it directly (the audit's own
// allowance already paid for it — do NOT double-charge). Both callers persist
// the result their own way.

// How many grid points we scan in parallel — keeps a 7×7 (49) scan from firing
// 49 requests at once while still finishing quickly.
const SCAN_CONCURRENCY = 5;

export type GridScanParams = {
  keyword: string;
  targetBusinessName: string;
  targetPlaceId?: string | null;
  centerLat: number;
  centerLng: number;
  gridSize: number;
  radiusKm: number;
};

export type GridScanResult = {
  avgRank: number;
  pctInTop3: number;
  gridPoints: { lat: number; lng: number; rank: number | null }[];
  competitors: CompetitorSummary;
  providerName: string;
  requestsMade: number;
  failures: number;
  lastError: unknown;
};

export async function executeGridScan(
  params: GridScanParams,
): Promise<GridScanResult> {
  const points = generateGrid(
    params.centerLat,
    params.centerLng,
    params.gridSize,
    params.radiusKm,
  );
  const n = points.length;
  const provider = getSerpProvider();

  const gridPoints = points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    rank: null as number | null,
  }));
  // Top local results per cell, kept so the competitor aggregate below costs no
  // extra API calls (the provider already returned them).
  const cellTops: LocalResult[][] = points.map(() => []);

  let next = 0;
  let failures = 0;
  let lastError: unknown = null;
  async function worker() {
    while (next < n) {
      const i = next++;
      try {
        const res = await provider.searchLocalRank({
          keyword: params.keyword,
          lat: points[i].lat,
          lng: points[i].lng,
          targetBusinessName: params.targetBusinessName,
          targetPlaceId: params.targetPlaceId ?? null,
        });
        gridPoints[i].rank = res.rank;
        cellTops[i] = res.topResults;
      } catch (err) {
        failures++;
        lastError = err;
        gridPoints[i].rank = null;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, n) }, () => worker()),
  );

  const mean =
    gridPoints.reduce((s, p) => s + (p.rank ?? NOT_FOUND_RANK), 0) / n;
  const inTop3 = gridPoints.filter((p) => p.rank != null && p.rank <= 3).length;

  const competitors = buildCompetitorSummary(
    points.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      targetRank: gridPoints[i].rank,
      top: cellTops[i],
    })),
    params.targetBusinessName,
  );

  return {
    avgRank: Math.round(mean * 10) / 10,
    pctInTop3: Math.round((inTop3 / n) * 1000) / 10,
    gridPoints,
    competitors,
    providerName: provider.name,
    requestsMade: n,
    failures,
    lastError,
  };
}
