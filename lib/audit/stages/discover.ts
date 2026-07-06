import "server-only";

import { executeGridScan } from "@/lib/serp/scan";
import { matchTarget } from "@/lib/serp/match";
import type { RawLocalResult } from "@/lib/serp/types";
import { placesTextSearch } from "@/lib/places/client";
import type { CompetitorSummary, CompetitorRow } from "@/lib/types";
import {
  COST_INR,
  MAX_COMPETITORS,
  MAX_ENTITIES,
  SCAN_FRESHNESS_DAYS,
} from "@/lib/audit/config";
import type { StageContext, StageResult } from "@/lib/audit/types";

// STAGE 1 — DISCOVER. Identify the clinic ('self') + its top competitors and
// resolve each to a Google place_id, writing audit_entities. Reuses the grid
// scan (chargeless) when the latest scan is stale, and the O1/O2 canonical
// name matcher to pick the right place from Text Search. Idempotent: clears the
// run's entities (cascading their signals) before rewriting.

export async function stageDiscover(ctx: StageContext): Promise<StageResult> {
  const { admin, run } = ctx;
  let cost = 0;

  // --- clinic identity — sourced ENTIRELY from Settings (the clinics table
  //     that the Settings page writes: name, locale, website, and the map
  //     coordinates). The audit relies on nothing outside Settings. ---
  const { data: clinic } = await admin
    .from("clinics")
    .select("business_name, website_url, city, area, default_lat, default_lng")
    .eq("id", run.clinic_id)
    .single();
  if (!clinic) throw new Error("Clinic not found for this run.");
  if (clinic.default_lat == null || clinic.default_lng == null) {
    throw new Error("Set your clinic location in Settings before a deep audit.");
  }
  const centerLat = Number(clinic.default_lat);
  const centerLng = Number(clinic.default_lng);
  const selfName = clinic.business_name; // canonical identity = the Settings name

  // OPTIONAL rank-tracking keyword — used only to reuse its scan params + stored
  // place_id when the clinic happens to have one. Not required: everything else
  // is derived from Settings, so a Settings-only clinic still audits fine.
  const { data: kw } = await admin
    .from("rank_tracking_keywords")
    .select("id, keyword, target_place_id, grid_size, radius_km")
    .eq("clinic_id", run.clinic_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  // Grid-scan inputs: from the keyword if present, else derived from the
  // Settings locale (area/city) with sensible defaults.
  const scanKeyword =
    kw?.keyword?.trim() ||
    `dentist in ${(clinic.area || clinic.city || "").trim()}`.trim() ||
    "dentist near me";
  const gridSize = kw?.grid_size ?? 5;
  const radiusKm = kw?.radius_km != null ? Number(kw.radius_km) : 3;
  const storedPlaceId = (kw?.target_place_id as string | null) ?? null;

  // --- latest scan, or run a fresh one if stale (>30d) ---
  const { data: latestScan } = await admin
    .from("rank_scans")
    .select("id, scanned_at, competitors")
    .eq("clinic_id", run.clinic_id)
    .eq("status", "complete")
    .order("scanned_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const staleBefore = Date.now() - SCAN_FRESHNESS_DAYS * 86_400_000;
  const isFresh =
    latestScan?.competitors != null &&
    latestScan.scanned_at != null &&
    new Date(latestScan.scanned_at).getTime() >= staleBefore;

  let summary: CompetitorSummary;
  if (isFresh) {
    summary = latestScan!.competitors as CompetitorSummary;
  } else {
    // Chargeless scan — the audit's allowance already paid for it.
    const scan = await executeGridScan({
      keyword: scanKeyword,
      targetBusinessName: selfName,
      targetPlaceId: storedPlaceId,
      centerLat,
      centerLng,
      gridSize,
      radiusKm,
    });
    cost += scan.requestsMade * COST_INR.serpRequest;
    if (scan.failures === scan.requestsMade) {
      throw new Error("Could not refresh the map scan (every request failed).");
    }
    // rank_scans.keyword_id is required, so we can only persist the scan when a
    // keyword row exists to attach it to; otherwise the aggregate is used
    // in-memory (the audit needs the competitor set, not a stored scan).
    if (kw?.id) {
      await admin.from("rank_scans").insert({
        clinic_id: run.clinic_id,
        keyword_id: kw.id,
        avg_rank: scan.avgRank,
        pct_in_top3: scan.pctInTop3,
        grid_points: scan.gridPoints,
        competitors: scan.competitors,
        provider: scan.providerName,
        requests_made: scan.requestsMade,
        status: "complete",
      });
    }
    summary = scan.competitors;
  }

  // Most frequent top-3 occupants across the grid → top N rivals.
  const rivals: CompetitorRow[] = [...(summary.rivals ?? [])]
    .sort(
      (a, b) =>
        (b.top3_cells ?? 0) - (a.top3_cells ?? 0) ||
        (b.cells_present ?? 0) - (a.cells_present ?? 0),
    )
    .slice(0, MAX_COMPETITORS);

  const searchRadiusM = radiusKm * 1000 || 5000;

  // --- resolve self place_id: stored on the keyword if present, else DERIVED
  //     from the Settings name + coordinates via Text Search ---
  let selfPlaceId = storedPlaceId;
  if (!selfPlaceId) {
    const r = await resolvePlaceId(selfName, centerLat, centerLng, searchRadiusM);
    cost += COST_INR.placesTextSearch;
    selfPlaceId = r;
  }

  // --- resolve each competitor place_id via Text Search + canonical match ---
  const competitorPlaceIds: string[] = [];
  const competitorEntities: {
    place_id: string;
    display_name: string;
  }[] = [];
  for (const rival of rivals) {
    if (competitorEntities.length >= MAX_ENTITIES - 1) break; // keep room for self
    const placeId = await resolvePlaceId(
      rival.name,
      centerLat,
      centerLng,
      searchRadiusM,
    );
    cost += COST_INR.placesTextSearch;
    if (!placeId || placeId === selfPlaceId) continue; // skip unresolved / self
    if (competitorPlaceIds.includes(placeId)) continue; // dedupe
    competitorPlaceIds.push(placeId);
    competitorEntities.push({ place_id: placeId, display_name: rival.name });
  }

  // --- idempotent rewrite of this run's entities ---
  await admin.from("audit_entities").delete().eq("run_id", run.id);

  const rows = [
    {
      run_id: run.id,
      clinic_id: run.clinic_id,
      entity_kind: "self",
      place_id: selfPlaceId,
      display_name: clinic.business_name,
      website_url: clinic.website_url,
    },
    ...competitorEntities.map((c) => ({
      run_id: run.id,
      clinic_id: run.clinic_id,
      entity_kind: "competitor",
      place_id: c.place_id,
      display_name: c.display_name,
      website_url: null,
    })),
  ];
  const { error: insErr } = await admin.from("audit_entities").insert(rows);
  if (insErr) throw new Error(`Failed to write entities: ${insErr.message}`);

  await admin
    .from("audit_runs")
    .update({ competitor_place_ids: competitorPlaceIds })
    .eq("id", run.id);

  return {
    costInr: cost,
    detail: `Discovered ${competitorEntities.length} competitor${
      competitorEntities.length === 1 ? "" : "s"
    }`,
  };
}

// Text Search near the clinic, then the exact O1/O2 canonical matcher to pick
// the right result. Returns null if nothing matches (better to drop a
// competitor than to audit the wrong business).
async function resolvePlaceId(
  name: string,
  lat: number,
  lng: number,
  radiusM: number,
): Promise<string | null> {
  if (!name.trim()) return null;
  const candidates = await placesTextSearch(name, { lat, lng, radiusM });
  if (candidates.length === 0) return null;
  const results: RawLocalResult[] = candidates.map((c, i) => ({
    name: c.name,
    rank: i + 1,
    rating: null,
    reviews_count: null,
    has_website: false,
    placeId: c.placeId,
  }));
  const rank = matchTarget(results, name);
  if (rank == null) return null;
  return results[rank - 1]?.placeId ?? null;
}
