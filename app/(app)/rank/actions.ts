"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSerpProvider,
  generateGrid,
  NOT_FOUND_RANK,
  buildCompetitorSummary,
} from "@/lib/serp";
import type { LocalResult } from "@/lib/serp";
import { getScanBudget } from "@/lib/serp/budget";

export type RankActionState = { ok?: boolean; error?: string };

// How many grid points we scan in parallel. Keeps a full 7×7 (49) scan from
// firing 49 requests at once while still finishing reasonably fast.
const SCAN_CONCURRENCY = 5;

async function clinicId(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  return data?.home_clinic_id ?? null;
}

export async function addKeyword(input: {
  keyword: string;
  target_business_name: string;
  target_place_id: string;
  center_lat: string;
  center_lng: string;
  grid_size: string;
  radius_km: string;
}): Promise<RankActionState> {
  const keyword = input.keyword.trim();
  const target = input.target_business_name.trim();
  if (!keyword) return { error: "Keyword is required." };
  if (!target) return { error: "Target business name is required." };

  const lat = Number(input.center_lat);
  const lng = Number(input.center_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { error: "Enter a valid centre latitude and longitude." };
  }

  const gridSize = [3, 5, 7].includes(Number(input.grid_size))
    ? Number(input.grid_size)
    : 5;
  const radiusKm = Number(input.radius_km) > 0 ? Number(input.radius_km) : 3;

  const supabase = createClient();
  const clinic = await clinicId(supabase);
  if (!clinic) return { error: "No clinic found for user." };

  const { error } = await supabase.from("rank_tracking_keywords").insert({
    clinic_id: clinic,
    keyword,
    target_business_name: target,
    target_place_id: input.target_place_id.trim() || null,
    center_lat: lat,
    center_lng: lng,
    grid_size: gridSize,
    radius_km: radiusKm,
    is_active: true,
  });
  if (error) return { error: "Could not add keyword. Please try again." };

  revalidatePath("/rank");
  return { ok: true };
}

export async function runScan(keywordId: string): Promise<RankActionState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // RLS scopes this read to the caller's clinic.
  const { data: kw } = await supabase
    .from("rank_tracking_keywords")
    .select(
      "id, clinic_id, keyword, target_business_name, target_place_id, center_lat, center_lng, grid_size, radius_km",
    )
    .eq("id", keywordId)
    .maybeSingle();
  if (!kw) return { error: "Keyword not found." };

  // Destructure into locals so narrowing survives inside the worker closure.
  const {
    id: kwId,
    clinic_id: kwClinicId,
    keyword: kwKeyword,
    target_business_name: kwTarget,
    target_place_id: kwPlaceId,
  } = kw;

  const points = generateGrid(
    Number(kw.center_lat),
    Number(kw.center_lng),
    kw.grid_size,
    Number(kw.radius_km),
  );
  const n = points.length;

  // Cost guard: one scan uses one of the clinic's monthly allowance.
  const { remaining, cap } = await getScanBudget(supabase);
  if (remaining < 1) {
    return {
      error: `You've used all ${cap} scans for this month. Credit top-ups are coming once payments go live.`,
    };
  }

  const provider = getSerpProvider();
  const gridPoints = points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    rank: null as number | null,
  }));
  // Top local results per cell, kept so we can compute the competitor aggregate
  // below without any extra API calls (the provider already returned them).
  const cellTops: LocalResult[][] = points.map(() => []);

  // Bounded-concurrency worker pool over the grid points.
  let next = 0;
  let failures = 0;
  async function worker() {
    while (next < n) {
      const i = next++;
      try {
        const res = await provider.searchLocalRank({
          keyword: kwKeyword,
          lat: points[i].lat,
          lng: points[i].lng,
          targetBusinessName: kwTarget,
          targetPlaceId: kwPlaceId,
        });
        gridPoints[i].rank = res.rank;
        cellTops[i] = res.topResults;
      } catch {
        failures++;
        gridPoints[i].rank = null;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, n) }, () => worker()),
  );

  // Every point failed → don't save a misleading all-blank scan.
  if (failures === n) {
    return {
      error:
        "Every scan request failed — check SERP_PROVIDER and the provider's API key.",
    };
  }

  const mean =
    gridPoints.reduce((s, p) => s + (p.rank ?? NOT_FOUND_RANK), 0) / n;
  const inTop3 = gridPoints.filter((p) => p.rank != null && p.rank <= 3).length;
  const avgRank = Math.round(mean * 10) / 10;
  const pctInTop3 = Math.round((inTop3 / n) * 1000) / 10;

  // Competitor aggregate — derived from the top results we already fetched, so
  // it costs no extra requests. Powers the /competitors feature.
  const competitors = buildCompetitorSummary(
    points.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      targetRank: gridPoints[i].rank,
      top: cellTops[i],
    })),
    kwTarget,
  );

  const { error } = await supabase.from("rank_scans").insert({
    clinic_id: kwClinicId,
    keyword_id: kwId,
    avg_rank: avgRank,
    pct_in_top3: pctInTop3,
    grid_points: gridPoints,
    competitors,
    provider: provider.name,
    requests_made: n,
    created_by: user.id,
  });
  if (error) return { error: "Scan finished but saving the result failed." };

  revalidatePath("/rank");
  revalidatePath(`/rank/${keywordId}`);
  revalidatePath("/competitors");
  return { ok: true };
}
