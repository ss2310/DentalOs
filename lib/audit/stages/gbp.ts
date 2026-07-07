import "server-only";

import { placeDetails, type PlaceDetails } from "@/lib/places/client";
import { COST_INR } from "@/lib/audit/config";
import type {
  StageContext,
  StageResult,
  AuditEntity,
  SignalInsert,
} from "@/lib/audit/types";

// STAGE 2 — GBP PULL. Places Details (field-masked) for self + each competitor
// → one audit_signals row per places-source metric, with the payload fragment in
// raw_meta. Also snapshots review-velocity deltas vs the previous COMPLETED run.
// Idempotent: clears this run's places signals before rewriting.

export async function stageGbpPull(ctx: StageContext): Promise<StageResult> {
  const { admin, run } = ctx;
  let cost = 0;

  const { data: entities } = await admin
    .from("audit_entities")
    .select("id, run_id, clinic_id, entity_kind, place_id, display_name")
    .eq("run_id", run.id);
  const list = (entities ?? []) as AuditEntity[];
  if (list.length === 0) throw new Error("No entities to collect (run Stage 1).");

  // Previous COMPLETED run for this clinic — the baseline for velocity. None on
  // the first audit (velocity silently appears from run #2 onward). This only
  // fires once the full pipeline marks runs 'complete' (Stages 4–6).
  const { data: prevRun } = await admin
    .from("audit_runs")
    .select("id, completed_at")
    .eq("clinic_id", run.clinic_id)
    .eq("status", "complete")
    .neq("id", run.id)
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Idempotent: drop this run's places signals before recollecting.
  await admin
    .from("audit_signals")
    .delete()
    .eq("run_id", run.id)
    .eq("source", "places");

  const signals: SignalInsert[] = [];
  let collected = 0;

  for (const entity of list) {
    if (!entity.place_id) continue;
    let details: PlaceDetails;
    try {
      details = await placeDetails(entity.place_id);
      cost += COST_INR.placesDetails;
    } catch (err) {
      // A failed GBP pull for one entity shouldn't sink the run.
      console.error("Places Details failed for", entity.place_id, err);
      continue;
    }
    collected++;

    const push = (
      metric_key: string,
      v: Pick<SignalInsert, "value_number" | "value_bool" | "value_text">,
      raw_meta: Record<string, unknown> | null = null,
    ) =>
      signals.push({
        run_id: run.id,
        entity_id: entity.id,
        clinic_id: run.clinic_id,
        metric_key,
        source: "places",
        ...v,
        raw_meta,
      });

    const rating = details.rating ?? null;
    const reviews = details.userRatingCount ?? null;
    const photoCount = details.photos?.length ?? 0;
    const types = details.types ?? [];
    const weekdays =
      details.regularOpeningHours?.weekdayDescriptions?.length ?? 0;

    push("avg_google_rating", { value_number: rating }, { rating });
    push("total_google_reviews", { value_number: reviews }, { reviews });
    push(
      "photo_count",
      { value_number: photoCount },
      // The Details mask returns a capped set of photo refs, not the true total.
      { capped: true, note: "Places returns a limited photo set" },
    );
    push(
      "primary_gbp_category",
      { value_text: details.primaryTypeDisplayName?.text ?? null },
      { primaryType: details.primaryTypeDisplayName?.text ?? null },
    );
    push(
      "secondary_categories",
      { value_text: types.length ? types.join(", ") : null },
      { types },
    );
    push("category_count", { value_number: types.length }, { types });
    push(
      "business_hours_complete",
      { value_bool: weekdays >= 7 },
      { weekdayDescriptions: weekdays },
    );

    // --- review velocity vs previous completed run (normalized to 30 days) ---
    if (prevRun?.id && prevRun.completed_at && reviews != null) {
      const { data: prior } = await admin
        .from("audit_signals")
        .select("value_number, audit_entities!inner(place_id)")
        .eq("run_id", prevRun.id)
        .eq("metric_key", "total_google_reviews")
        .eq("audit_entities.place_id", entity.place_id)
        .maybeSingle();
      const then = (prior as { value_number: number | null } | null)
        ?.value_number;
      if (then != null) {
        const days =
          (Date.now() - new Date(prevRun.completed_at).getTime()) /
          86_400_000;
        if (days >= 1) {
          const velocity =
            Math.round(((reviews - then) / days) * 30 * 10) / 10;
          push(
            "review_velocity_computed",
            { value_number: velocity },
            { then, now: reviews, days: Math.round(days) },
          );
        }
      }
    }

    // Enrich the entity for Stage 3 (website) + the report (name / GBP link).
    await admin
      .from("audit_entities")
      .update({
        display_name: details.displayName?.text ?? entity.display_name,
        website_url: details.websiteUri ?? null,
        gbp_url: details.googleMapsUri ?? null,
      })
      .eq("id", entity.id);
  }

  if (signals.length > 0) {
    const { error } = await admin.from("audit_signals").insert(signals);
    if (error) throw new Error(`Failed to write GBP signals: ${error.message}`);
  }

  return { costInr: cost, detail: `Pulled GBP data for ${collected} businesses` };
}
