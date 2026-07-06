// Stage 6 — synthesis INPUT builder. Pure + dependency-free (node --test).
// Turns the persisted scored rows into the compact, evidence-only payload the
// Claude synthesis call receives, and derives the guardrails the validator
// enforces. No web content, no free facts — ONLY measured rows.
//
// The single planning door is plannableGaps(): unmeasured moats are dropped
// here, so they never enter the prompt and can never become plan items.

import { plannableGaps } from "./scoring.mjs";

// Read a display value for a metric from a per-entity value map (bool false is
// a real value, so only null/undefined mean "not measured").
function pick(values, key) {
  const v = values ? values[key] : undefined;
  return v === undefined ? null : v;
}

/**
 * Build the synthesis payload + guardrails.
 *
 * @param {object} args
 *  - selfScores:   moat_scores rows for self  [{moat_key, score, signals_measured, signals_total}]
 *  - rivals:       [{ name, scores: MoatScore[], values: {metric_key: val} }]
 *  - moatConfig:   [{moat_key, display_name, weight_pct}]
 *  - metricsByMoat:{ moat_key: [{metric_key, label}] }
 *  - selfValues:   { metric_key: val }
 *  - clinic:       { name, area, city }
 *  - prior:        null | { plan_completed, plan_total, avg_prev, avg_now, visibility_prev, visibility_now }
 * @returns { payload, eligibleMetricKeys, metricToMoat, gapOrder }
 */
export function buildSynthesisPayload(args) {
  const {
    selfScores = [],
    rivals = [],
    moatConfig = [],
    metricsByMoat = {},
    selfValues = {},
    clinic = {},
    prior = null,
  } = args ?? {};

  const nameByKey = new Map(moatConfig.map((m) => [m.moat_key, m.display_name]));
  const gaps = plannableGaps(
    selfScores,
    rivals.map((r) => r.scores ?? []),
    moatConfig,
  );

  // metric_key → moat_key across ALL moats (for the validator's theme cap).
  const metricToMoat = {};
  for (const [moatKey, list] of Object.entries(metricsByMoat)) {
    for (const m of list ?? []) metricToMoat[m.metric_key] = moatKey;
  }

  // Only the metrics of gap-eligible moats are quotable in a plan item.
  const eligibleMetricKeys = [];
  const gapOrder = [];
  const payloadGaps = [];

  for (const g of gaps) {
    gapOrder.push(g.moat_key);
    const rival = g.best_rival_index == null ? null : rivals[g.best_rival_index];
    const metrics = metricsByMoat[g.moat_key] ?? [];

    const signals = [];
    for (const { metric_key, label } of metrics) {
      eligibleMetricKeys.push(metric_key);
      const self = pick(selfValues, metric_key);
      const comp = rival ? pick(rival.values, metric_key) : null;
      // Keep only metrics where at least one side has a measured value — an
      // empty row is noise Claude might hallucinate around.
      if (self == null && comp == null) continue;
      signals.push({ metric_key, label, self, competitor: comp });
    }

    payloadGaps.push({
      moat_key: g.moat_key,
      moat_name: nameByKey.get(g.moat_key) ?? g.moat_key,
      weight_pct: g.weight_pct,
      weighted_gap: g.weighted_gap,
      self_score: g.self_score,
      competitor: rival
        ? { name: rival.name, score: g.best_rival_score }
        : null,
      signals,
    });
  }

  const payload = {
    clinic: {
      name: clinic.name ?? "",
      area: clinic.area ?? "",
      city: clinic.city ?? "",
    },
    competitors: rivals.map((r) => r.name),
    gaps: payloadGaps,
    prior: prior ?? null,
  };

  return { payload, eligibleMetricKeys, metricToMoat, gapOrder };
}
