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
import { getAuditBudget } from "@/lib/serp/budget";
import {
  buildProspectSummary,
  type ProspectCheckResult,
} from "@/lib/ai-visibility";

export type AuditActionState = {
  ok?: boolean;
  error?: string;
  id?: string;
  token?: string;
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

  // Cost guard: one audit uses one of this agency user's monthly allowance.
  const { remaining, cap } = await getAuditBudget(supabase);
  if (remaining < 1) {
    return {
      error: `You've used all ${cap} audits for this month. Credit top-ups are coming once payments go live.`,
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
      } catch {
        failures++;
        gridPoints[i].rank = null;
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SCAN_CONCURRENCY, n) }, () => worker()),
  );

  // Every point failed → don't save a misleading all-blank audit.
  if (failures === n) {
    return {
      error:
        "Every request failed — check SERP_PROVIDER and the provider's API key.",
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

  const { data, error } = await supabase
    .from("prospect_audits")
    .insert({
      created_by: user.id,
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
    })
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
