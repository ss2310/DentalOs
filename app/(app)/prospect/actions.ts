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
import { buildAuditFindings } from "@/lib/serp/findings";
import { monthlyAuditCap } from "@/lib/serp/budget";
import { spendCredits, refundCredit } from "@/lib/credits";
import {
  buildProspectSummary,
  type ProspectCheckResult,
} from "@/lib/ai-visibility";

export type AuditActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  token?: string;
  upgrade?: boolean;
};

// Same bound as clinic scans — a 5×5 audit fires 25 requests, 5 at a time.
const SCAN_CONCURRENCY = 5;

// Returns the signed-in agency user, or null. Agency membership is enforced
// again by RLS on prospect_audits (created_by = auth.uid() AND is_agency()),
// so this is a friendly-error guard, not the security boundary.
async function agencyUser(
  supabase: SupabaseClient,
): Promise<{ id: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("is_agency")
    .eq("id", user.id)
    .single();
  return data?.is_agency ? { id: user.id } : null;
}

export type RunAuditInput = {
  business_name: string;
  area: string;
  city: string;
  keyword: string;
  center_lat: string;
  center_lng: string;
  grid_size: string;
  radius_km: string;
  place_id: string;
};

export async function runAudit(
  input: RunAuditInput,
): Promise<AuditActionState> {
  const supabase = createClient();
  const user = await agencyUser(supabase);
  if (!user) return { error: "Prospecting is available to agency accounts only." };

  const business = input.business_name.trim();
  const keyword = input.keyword.trim();
  const area = input.area.trim();
  const city = input.city.trim();
  if (!business) return { error: "Business name is required." };
  if (!keyword) return { error: "A primary keyword is required." };

  const lat = Number(input.center_lat);
  const lng = Number(input.center_lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { error: "Enter a valid centre latitude and longitude." };
  }

  const gridSize = [3, 5, 7].includes(Number(input.grid_size))
    ? Number(input.grid_size)
    : 5;
  const radiusKm = Number(input.radius_km) > 0 ? Number(input.radius_km) : 3;
  const placeId = input.place_id.trim() || null;

  const points = generateGrid(lat, lng, gridSize, radiusKm);
  const n = points.length;

  // Spend 1 map credit (from the agency user's clinic) before running — one map
  // credit = one audit, regardless of grid size. Blocks with an upgrade prompt
  // at 0. Refunded below if the audit can't start or every request fails.
  const mapSpend = await spendCredits("map", 1, "map_scan");
  if (!mapSpend.ok) {
    if ("insufficient" in mapSpend) {
      return {
        error: "You're out of map-scan credits. Upgrade to run more audits.",
        upgrade: true,
      };
    }
    return { error: mapSpend.error };
  }

  // Reserve an audit slot ATOMICALLY before the provider calls (SEC-M1): the
  // RPC serializes per agency user, so concurrent audits can't overrun the
  // monthly cap. It inserts a 'reserved' prospect_audits row now; we finalize
  // it after the audit, or delete it if every request fails.
  const cap = monthlyAuditCap();
  const { data: auditId, error: reserveError } = await supabase.rpc(
    "reserve_prospect_audit",
    { p_cap: cap },
  );
  if (reserveError || !auditId) {
    // The audit never started — give the map credit back.
    await refundCredit(mapSpend.ledgerId);
    // Same anti-swallow treatment as runScan: log the real error, return a
    // specific reason (cap vs. missing DB function vs. other).
    if (reserveError) {
      console.error("reserve_prospect_audit failed:", {
        code: reserveError.code,
        message: reserveError.message,
        details: reserveError.details,
      });
    }
    const msg = reserveError?.message ?? "";
    if (/cap reached/i.test(msg)) {
      return {
        error: `You've used all ${cap} audits for this month. Credit top-ups are coming once payments go live.`,
      };
    }
    if (
      reserveError?.code === "PGRST202" ||
      /schema cache|does not exist|find the function/i.test(msg)
    ) {
      return {
        error:
          "Audits aren't set up on the database yet — run migration 015 (reserve_prospect_audit) in Supabase, then retry.",
      };
    }
    return {
      error: reserveError?.code
        ? `Could not start the audit (${reserveError.code}). Please try again.`
        : "Could not start the audit. Please try again.",
    };
  }

  const provider = getSerpProvider();
  const gridPoints = points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    rank: null as number | null,
  }));
  const cellTops: LocalResult[][] = points.map(() => []);

  let next = 0;
  let failures = 0;
  let lastError: unknown = null;
  async function worker() {
    while (next < n) {
      const i = next++;
      try {
        const res = await provider.searchLocalRank({
          keyword,
          lat: points[i].lat,
          lng: points[i].lng,
          targetBusinessName: business,
          targetPlaceId: placeId,
        });
        gridPoints[i].rank = res.rank;
        cellTops[i] = res.topResults;
      } catch (err) {
        failures++;
        lastError = err; // keep the real provider error to surface below
        gridPoints[i].rank = null;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, n) }, () => worker()),
  );

  // Every point failed → don't keep a misleading all-blank audit. Delete the
  // reservation so it doesn't count against the monthly cap, and surface the
  // real provider error instead of a vague message.
  if (failures === n) {
    await supabase.from("prospect_audits").delete().eq("id", auditId);
    await refundCredit(mapSpend.ledgerId);
    console.error("All audit requests failed:", lastError);
    const reason = lastError instanceof Error ? lastError.message : "";
    return {
      error: reason
        ? `Every request failed (${reason}). Check SERP_PROVIDER and the provider's API key.`
        : "Every request failed — check SERP_PROVIDER and the provider's API key.",
    };
  }

  const mean =
    gridPoints.reduce((s, p) => s + (p.rank ?? NOT_FOUND_RANK), 0) / n;
  const inTop3 = gridPoints.filter((p) => p.rank != null && p.rank <= 3).length;
  const avgRank = Math.round(mean * 10) / 10;
  const pctInTop3 = Math.round((inTop3 / n) * 1000) / 10;

  // Same competitor aggregate as the clinic feature — this business is just the
  // "target" here — plus plain-English findings for the prospect report.
  const competitors = buildCompetitorSummary(
    points.map((p, i) => ({
      lat: p.lat,
      lng: p.lng,
      targetRank: gridPoints[i].rank,
      top: cellTops[i],
    })),
    business,
  );
  const findings = buildAuditFindings({
    summary: competitors,
    keyword,
    area,
    pctInTop3,
  });

  // Finalize the reserved row with the results (RLS scopes to this user).
  const { data, error } = await supabase
    .from("prospect_audits")
    .update({
      business_name: business,
      area: area || null,
      city: city || null,
      keyword,
      center_lat: lat,
      center_lng: lng,
      grid_points: gridPoints,
      avg_rank: avgRank,
      pct_in_top3: pctInTop3,
      competitors,
      findings,
      // ai_visibility_summary stays null — populated later by the R4 flow.
      provider: provider.name,
      requests_made: n,
      status: "complete",
    })
    .eq("id", auditId)
    .select("id, share_token")
    .single();
  if (error || !data) {
    return { error: "Audit finished but saving the result failed." };
  }

  revalidatePath("/prospect");
  return { ok: true, id: data.id, token: data.share_token };
}

/**
 * Writes a prospect AI-visibility check session into the audit's
 * ai_visibility_summary (the shape the public R3 report renders). Agency-only,
 * like runAudit; RLS on prospect_audits also scopes the update to this user.
 */
export async function saveProspectAiSummary(
  auditId: string,
  results: ProspectCheckResult[],
): Promise<AuditActionState> {
  const supabase = createClient();
  const user = await agencyUser(supabase);
  if (!user) return { error: "Prospecting is available to agency accounts only." };
  if (!auditId) return { error: "Missing audit." };
  if (!results.length) return { error: "No checks to save." };

  const summary = buildProspectSummary(results, new Date().toISOString());
  const { error } = await supabase
    .from("prospect_audits")
    .update({ ai_visibility_summary: summary })
    .eq("id", auditId);
  if (error) return { error: "Could not save the AI visibility results." };

  revalidatePath(`/prospect/${auditId}`);
  return { ok: true, id: auditId };
}
