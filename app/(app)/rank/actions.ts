"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { executeGridScan } from "@/lib/serp/scan";
import { monthlyScanCap } from "@/lib/serp/budget";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { spendCredits, refundCredit } from "@/lib/credits";

export type RankActionState = { ok?: boolean; error?: string; upgrade?: boolean };

export async function addKeyword(input: {
  keyword: string;
  target_business_name: string;
  target_place_id: string;
  grid_size: string;
  radius_km: string;
}): Promise<RankActionState> {
  // SEC-M5: rank tracking is an owner/doctor feature; guard the action too.
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }

  const keyword = input.keyword.trim();
  const target = input.target_business_name.trim();
  if (!keyword) return { error: "Keyword is required." };
  if (!target) return { error: "Target business name is required." };

  const gridSize = [3, 5, 7].includes(Number(input.grid_size))
    ? Number(input.grid_size)
    : 5;
  const radiusKm = Number(input.radius_km) > 0 ? Number(input.radius_km) : 3;

  const supabase = createClient();
  // The scan centre is the clinic's saved location (set once in Settings) —
  // no per-keyword coordinates. Stamp it onto the keyword so the row is valid.
  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, default_lat, default_lng")
    .single();
  if (!clinic) return { error: "No clinic found for user." };
  if (clinic.default_lat == null || clinic.default_lng == null) {
    return {
      error: "Set your clinic location in Settings before adding keywords.",
    };
  }

  const { error } = await supabase.from("rank_tracking_keywords").insert({
    clinic_id: clinic.id,
    keyword,
    target_business_name: target,
    target_place_id: input.target_place_id.trim() || null,
    center_lat: Number(clinic.default_lat),
    center_lng: Number(clinic.default_lng),
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
  // SEC-M5: scans cost the clinic's SERP budget — owner/doctor only.
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }

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
    keyword: kwKeyword,
    target_business_name: kwTarget,
    target_place_id: kwPlaceId,
  } = kw;

  // Centre on the clinic's CURRENT saved location (single source of truth), so
  // updating it in Settings moves every scan — not a stale per-keyword copy.
  const { data: clinicLoc } = await supabase
    .from("clinics")
    .select("default_lat, default_lng")
    .single();
  if (
    !clinicLoc ||
    clinicLoc.default_lat == null ||
    clinicLoc.default_lng == null
  ) {
    return {
      error: "Set your clinic location in Settings before running a scan.",
    };
  }

  // Spend 1 map credit before running (one map credit = one grid scan, no matter
  // how many SERP requests the grid fires). Blocks with an upgrade prompt at 0.
  // Refunded below if the scan can't start or every request fails.
  const mapSpend = await spendCredits("map", 1, "map_scan", kwId);
  if (!mapSpend.ok) {
    if ("insufficient" in mapSpend) {
      return {
        error: "You're out of map-scan credits. Upgrade to run more scans.",
        upgrade: true,
      };
    }
    return { error: mapSpend.error };
  }

  // Reserve a scan slot ATOMICALLY before hitting the provider (SEC-M1): the
  // RPC serializes per clinic, so concurrent scans can't overrun the monthly
  // cap. It inserts a 'reserved' rank_scans row now and returns its id; we
  // finalize it after the scan, or delete it if every request fails so a
  // failed scan doesn't burn quota.
  const cap = monthlyScanCap();
  const { data: scanId, error: reserveError } = await supabase.rpc(
    "reserve_rank_scan",
    { p_keyword_id: kwId, p_cap: cap },
  );
  if (reserveError || !scanId) {
    // The scan never started — give the map credit back.
    await refundCredit(mapSpend.ledgerId);
    // Never swallow the real reason again: log the full error, and return a
    // SPECIFIC message so this failure class is diagnosable from the UI + logs.
    if (reserveError) {
      console.error("reserve_rank_scan failed:", {
        code: reserveError.code,
        message: reserveError.message,
        details: reserveError.details,
      });
    }
    const msg = reserveError?.message ?? "";
    if (/cap reached/i.test(msg)) {
      return {
        error: `You've used all ${cap} scans for this month. Credit top-ups are coming once payments go live.`,
      };
    }
    // PGRST202 = the reserve function isn't in the DB (migration 015 not run,
    // or the PostgREST schema cache is stale). Point at the real fix.
    if (
      reserveError?.code === "PGRST202" ||
      /schema cache|does not exist|find the function/i.test(msg)
    ) {
      return {
        error:
          "Scans aren't set up on the database yet — run migration 015 (reserve_rank_scan) in Supabase, then retry.",
      };
    }
    return {
      error: reserveError?.code
        ? `Could not start the scan (${reserveError.code}). Please try again.`
        : "Could not start the scan. Please try again.",
    };
  }

  // Run the grid scan (chargeless core — the credit was spent above). Grid
  // generation + the bounded-concurrency provider loop + the competitor
  // aggregate all live in executeGridScan, shared with the Deep Audit pipeline.
  const scan = await executeGridScan({
    keyword: kwKeyword,
    targetBusinessName: kwTarget,
    targetPlaceId: kwPlaceId,
    centerLat: Number(clinicLoc.default_lat),
    centerLng: Number(clinicLoc.default_lng),
    gridSize: kw.grid_size,
    radiusKm: Number(kw.radius_km),
  });

  // Every point failed → don't keep a misleading all-blank scan. Delete the
  // reservation so it doesn't count against the monthly cap, and surface the
  // real provider error (e.g. "Serper request failed (429)") instead of a
  // vague message.
  if (scan.failures === scan.requestsMade) {
    await supabase.from("rank_scans").delete().eq("id", scanId);
    await refundCredit(mapSpend.ledgerId);
    console.error("All scan requests failed:", scan.lastError);
    const reason = scan.lastError instanceof Error ? scan.lastError.message : "";
    return {
      error: reason
        ? `Every scan request failed (${reason}). Check SERP_PROVIDER and the provider's API key.`
        : "Every scan request failed — check SERP_PROVIDER and the provider's API key.",
    };
  }

  // Finalize the reserved row with the results (RLS scopes to the clinic).
  const { error } = await supabase
    .from("rank_scans")
    .update({
      avg_rank: scan.avgRank,
      pct_in_top3: scan.pctInTop3,
      grid_points: scan.gridPoints,
      competitors: scan.competitors,
      provider: scan.providerName,
      requests_made: scan.requestsMade,
      status: "complete",
    })
    .eq("id", scanId);
  if (error) return { error: "Scan finished but saving the result failed." };

  revalidatePath("/rank");
  revalidatePath(`/rank/${keywordId}`);
  revalidatePath("/competitors");
  return { ok: true };
}
