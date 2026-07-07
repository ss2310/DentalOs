import "server-only";

import { runPageSpeedMobile } from "@/lib/pagespeed/client";
import { fetchSiteSnapshot } from "@/lib/audit/website";
import { classifyWebsiteMetrics } from "@/lib/audit/classify";
import { resolveForVertical } from "@/lib/vertical.mjs";
import { COST_INR } from "@/lib/audit/config";
import type {
  StageContext,
  StageResult,
  AuditEntity,
  MetricDef,
  SignalInsert,
  WebsiteSnapshot,
} from "@/lib/audit/types";

// STAGE 3 — WEB PULL. Per entity: PageSpeed (mobile) → pagespeed_mobile,
// core_web_vitals_pass, https_ssl; then ONE Claude call classifying ALL
// website_llm metrics against their rubrics. A slow/failed site records null
// signals (with raw_meta.error) — it never crashes the run. Idempotent: clears
// this run's pagespeed + website_llm signals first.

export async function stageWebPull(ctx: StageContext): Promise<StageResult> {
  const { admin, run } = ctx;
  let cost = 0;

  const { data: entities } = await admin
    .from("audit_entities")
    .select("id, run_id, clinic_id, entity_kind, place_id, display_name, website_url")
    .eq("run_id", run.id);
  const list = (entities ?? []) as AuditEntity[];
  if (list.length === 0) throw new Error("No entities to collect (run Stage 1).");

  // website_llm metric defs, resolved to the clinic's vertical (dental = NULL
  // shared pool). Rubric text is the classifier instruction, verbatim.
  const { data: clinic } = await admin
    .from("clinics")
    .select("vertical")
    .eq("id", run.clinic_id)
    .single();
  const { data: defRows } = await admin
    .from("metric_definitions")
    .select("metric_key, display_name, source, value_type, enum_options, rubric, vertical")
    .eq("source", "website_llm")
    .eq("is_active", true);
  const metrics = resolveForVertical(
    (defRows ?? []) as (MetricDef & { vertical: string | null })[],
    clinic?.vertical ?? "dental",
    (r: { metric_key: string }) => r.metric_key,
  ) as MetricDef[];

  // Idempotent: drop this run's web signals before recollecting.
  await admin
    .from("audit_signals")
    .delete()
    .eq("run_id", run.id)
    .in("source", ["pagespeed", "website_llm"]);

  const signals: SignalInsert[] = [];
  const push = (
    entity_id: string,
    metric_key: string,
    source: string,
    v: Pick<SignalInsert, "value_number" | "value_bool" | "value_text">,
    raw_meta: Record<string, unknown> | null = null,
  ) =>
    signals.push({
      run_id: run.id,
      entity_id,
      clinic_id: run.clinic_id,
      metric_key,
      source,
      ...v,
      raw_meta,
    });

  let sitesSeen = 0;

  for (const entity of list) {
    const site = entity.website_url;

    // --- PageSpeed (mobile) ---
    if (site) {
      try {
        const ps = await runPageSpeedMobile(site);
        cost += COST_INR.pagespeed;
        push(entity.id, "pagespeed_mobile", "pagespeed", {
          value_number: ps.performance,
        });
        push(entity.id, "core_web_vitals_pass", "pagespeed", {
          value_text: ps.coreWebVitals,
        });
        push(entity.id, "https_ssl", "pagespeed", { value_bool: ps.isHttps });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "pagespeed failed";
        push(entity.id, "pagespeed_mobile", "pagespeed", { value_number: null }, { error: msg });
        push(entity.id, "core_web_vitals_pass", "pagespeed", { value_text: null }, { error: msg });
        push(entity.id, "https_ssl", "pagespeed", { value_bool: null }, { error: msg });
      }
    } else {
      push(entity.id, "https_ssl", "pagespeed", { value_bool: null }, { note: "no website_url" });
    }

    // --- website_llm classification (ONE Claude call; runs even without a site
    //     so gbp_name_violation is still judged on the GBP name) ---
    let snapshot: WebsiteSnapshot | null = null;
    if (site) {
      snapshot = await fetchSiteSnapshot(site);
      if (!snapshot.fetchError) sitesSeen++;
    }
    try {
      const classified = await classifyWebsiteMetrics({
        metrics,
        gbpName: entity.display_name,
        snapshot,
      });
      cost += COST_INR.claudeClassify;
      for (const m of metrics) {
        const c = classified[m.metric_key];
        push(
          entity.id,
          m.metric_key,
          "website_llm",
          {
            value_number: c?.valueNumber ?? null,
            value_bool: c?.valueBool ?? null,
            value_text: c?.valueText ?? null,
          },
          { evidence: c?.evidence ?? "", fetchError: snapshot?.fetchError ?? null },
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "classification failed";
      for (const m of metrics) {
        push(entity.id, m.metric_key, "website_llm", {
          value_number: null,
          value_bool: null,
          value_text: null,
        }, { error: msg });
      }
    }
  }

  if (signals.length > 0) {
    const { error } = await admin.from("audit_signals").insert(signals);
    if (error) throw new Error(`Failed to write web signals: ${error.message}`);
  }

  return { costInr: cost, detail: `Analyzed ${sitesSeen} websites` };
}
