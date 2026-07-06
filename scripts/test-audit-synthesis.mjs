// Tests for the Stage-6 synthesis guardrails: the input builder
// (synthesis-input.mjs) and the reject-and-retry validator
// (synthesis-validate.mjs). These are the pure, testable proof that a plan
// item without a measured justification — or from an unmeasured moat — is
// impossible.
//   node --test scripts/test-audit-synthesis.mjs   (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSynthesisPayload } from "../lib/audit/synthesis-input.mjs";
import { validateSynthesis } from "../lib/audit/synthesis-validate.mjs";

const MOAT_CONFIG = [
  { moat_key: "ai_aeo_readiness", display_name: "AI / AEO Readiness", weight_pct: 25 },
  { moat_key: "trust_safety", display_name: "Trust & Safety", weight_pct: 20 },
  { moat_key: "local_seo_integrity", display_name: "Local SEO Integrity", weight_pct: 20 },
  { moat_key: "conversion", display_name: "Conversion", weight_pct: 15 },
  { moat_key: "operational_velocity", display_name: "Operational Velocity", weight_pct: 10 },
  { moat_key: "market_activity", display_name: "Market Activity", weight_pct: 10 },
];

const metricsByMoat = {
  ai_aeo_readiness: [{ metric_key: "ai_citation_rate", label: "AI Citation Rate" }],
  trust_safety: [
    { metric_key: "avg_google_rating", label: "Rating" },
    { metric_key: "total_google_reviews", label: "Reviews" },
  ],
  conversion: [{ metric_key: "whatsapp_cta", label: "WhatsApp CTA" }],
  operational_velocity: [{ metric_key: "post_frequency_3mo", label: "Posts/3mo" }],
  market_activity: [{ metric_key: "instagram_followers", label: "Instagram" }],
};

const ms = (moat_key, score, measured, total) => ({
  moat_key,
  score,
  signals_measured: measured,
  signals_total: total,
});

// A self that is MEASURED on trust/ai/conversion and UNMEASURED on
// op-velocity/market (the v1 reality), behind a rival on every moat.
function fixture() {
  const selfScores = [
    ms("ai_aeo_readiness", 15, 5, 7),
    ms("trust_safety", 55, 3, 5),
    ms("conversion", 40, 7, 9),
    ms("local_seo_integrity", 30, 10, 14),
    ms("operational_velocity", 3, 0, 4), // unmeasured
    ms("market_activity", 0, 0, 6), // unmeasured
  ];
  const rival = {
    name: "Dr. Sharma",
    scores: [
      ms("ai_aeo_readiness", 60, 5, 7),
      ms("trust_safety", 85, 3, 5),
      ms("conversion", 70, 7, 9),
      ms("local_seo_integrity", 55, 10, 14),
      ms("operational_velocity", 90, 3, 4),
      ms("market_activity", 80, 5, 6),
    ],
    values: {
      ai_citation_rate: 55,
      avg_google_rating: 4.9,
      total_google_reviews: 210,
      whatsapp_cta: true,
      post_frequency_3mo: 12,
      instagram_followers: 2000,
    },
  };
  const selfValues = {
    ai_citation_rate: 16.7,
    avg_google_rating: 4.6,
    total_google_reviews: 90,
    whatsapp_cta: false,
  };
  return { selfScores, rival, selfValues };
}

// ---- input builder --------------------------------------------------------

test("buildSynthesisPayload: unmeasured moats never enter the payload or eligible keys", () => {
  const { selfScores, rival, selfValues } = fixture();
  const { payload, eligibleMetricKeys, gapOrder } = buildSynthesisPayload({
    selfScores,
    rivals: [rival],
    moatConfig: MOAT_CONFIG,
    metricsByMoat,
    selfValues,
    clinic: { name: "You", area: "Kota", city: "Kota" },
  });
  const gapMoats = payload.gaps.map((g) => g.moat_key);
  assert.ok(!gapMoats.includes("operational_velocity"));
  assert.ok(!gapMoats.includes("market_activity"));
  // Their metric_keys are NOT quotable.
  assert.ok(!eligibleMetricKeys.includes("post_frequency_3mo"));
  assert.ok(!eligibleMetricKeys.includes("instagram_followers"));
  // Eligible ones are.
  assert.ok(eligibleMetricKeys.includes("ai_citation_rate"));
  assert.ok(eligibleMetricKeys.includes("total_google_reviews"));
});

test("buildSynthesisPayload: gaps ordered by weighted gap; evidence values attached", () => {
  const { selfScores, rival, selfValues } = fixture();
  const { payload, gapOrder } = buildSynthesisPayload({
    selfScores,
    rivals: [rival],
    moatConfig: MOAT_CONFIG,
    metricsByMoat,
    selfValues,
    clinic: {},
  });
  // AI: (60-15)*25/100=11.25 ; Trust:(85-55)*20/100=6 ; LocalSEO:(55-30)*20/100=5 ; Conv:(70-40)*15/100=4.5
  assert.deepEqual(gapOrder, ["ai_aeo_readiness", "trust_safety", "local_seo_integrity", "conversion"]);
  const trust = payload.gaps.find((g) => g.moat_key === "trust_safety");
  const reviews = trust.signals.find((s) => s.metric_key === "total_google_reviews");
  assert.equal(reviews.self, 90);
  assert.equal(reviews.competitor, 210);
  assert.equal(trust.competitor.name, "Dr. Sharma");
});

// ---- validator ------------------------------------------------------------

// A well-formed 12-item plan over eligible metric keys. Distribution keeps each
// moat within the theme cap (ai 4 / trust 3 / conversion 5), the top-gap moat
// (ai) on day 1, and a 15-min quick win on day 2.
function goodPlan() {
  const specs = [
    ["ai_citation_rate", "1-hour"], // 1  (top gap, early)
    ["total_google_reviews", "15-min"], // 2  (quick win, early)
    ["whatsapp_cta", "15-min"], // 3
    ["ai_citation_rate", "15-min"], // 4
    ["avg_google_rating", "1-hour"], // 5
    ["whatsapp_cta", "1-hour"], // 6
    ["ai_citation_rate", "1-hour"], // 7
    ["whatsapp_cta", "1-hour"], // 8
    ["total_google_reviews", "1-hour"], // 9
    ["whatsapp_cta", "1-hour"], // 10
    ["ai_citation_rate", "1-hour"], // 11
    ["whatsapp_cta", "15-min"], // 12
  ];
  const plan = specs.map(([mk, effort], i) => ({
    day_number: i + 1,
    title: `Task ${i + 1}`,
    description: "Do the concrete thing.",
    evidence: "You: 90 · Dr. Sharma: 210",
    competitor_context: "Dr. Sharma is ahead here.",
    metric_keys: [mk],
    effort,
  }));
  return {
    headline: "Competitors reply to reviews; you rarely do.",
    competitor_story: ["a", "b", "c"],
    plan,
  };
}

const OPTS = {
  eligibleMetricKeys: ["ai_citation_rate", "total_google_reviews", "avg_google_rating", "whatsapp_cta"],
  metricToMoat: {
    ai_citation_rate: "ai_aeo_readiness",
    total_google_reviews: "trust_safety",
    avg_google_rating: "trust_safety",
    whatsapp_cta: "conversion",
  },
  gapOrder: ["ai_aeo_readiness", "trust_safety", "conversion"],
};

test("validateSynthesis: accepts a well-formed plan", () => {
  const r = validateSynthesis(goodPlan(), OPTS);
  assert.equal(r.ok, true);
  assert.equal(r.plan.length, 12);
});

test("validateSynthesis: rejects an item with no evidence", () => {
  const p = goodPlan();
  p.plan[3].evidence = "  ";
  const r = validateSynthesis(p, OPTS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /evidence missing/);
});

test("validateSynthesis: rejects an item with no metric_keys", () => {
  const p = goodPlan();
  p.plan[2].metric_keys = [];
  const r = validateSynthesis(p, OPTS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /metric_keys missing/);
});

test("validateSynthesis: rejects a metric_key from an unmeasured moat (the gate)", () => {
  const p = goodPlan();
  // Inject an action citing an unmeasured moat's metric.
  p.plan[5].metric_keys = ["post_frequency_3mo"]; // op-velocity, not eligible
  const r = validateSynthesis(p, OPTS);
  assert.equal(r.ok, false);
  assert.match(r.reason, /ineligible metric_key "post_frequency_3mo"/);
});

test("validateSynthesis: enforces item count, theme cap, quick-win, top-gap-early", () => {
  // too few
  assert.equal(validateSynthesis({ ...goodPlan(), plan: goodPlan().plan.slice(0, 8) }, OPTS).ok, false);
  // theme cap: 6 items all trust → exceeds cap 5
  const capped = goodPlan();
  capped.plan = capped.plan.map((it, i) => ({
    ...it,
    metric_keys: ["total_google_reviews"],
    effort: i === 0 ? "15-min" : it.effort,
  }));
  assert.match(validateSynthesis(capped, OPTS).reason, /theme .*cap 5/);
  // no early quick win
  const noQuick = goodPlan();
  noQuick.plan = noQuick.plan.map((it) => ({ ...it, effort: "1-hour" }));
  assert.match(validateSynthesis(noQuick, OPTS).reason, /quick win/);
  // top-gap moat (ai) absent from days 1-5, everything else within cap so the
  // top-gap rule is what trips (not the theme cap).
  const mk = (m) => ["ai_citation_rate", "total_google_reviews", "avg_google_rating", "whatsapp_cta"][m];
  const layout = [1, 2, 3, 1, 3, 0, 0, 0, 0, 3, 3, 2]; // 0=ai only on days 6-9
  const noTop = {
    headline: "h",
    competitor_story: ["a", "b", "c"],
    plan: layout.map((m, i) => ({
      day_number: i + 1,
      title: `T${i + 1}`,
      description: "d",
      evidence: "You: 1 · Dr. Sharma: 2",
      competitor_context: "c",
      metric_keys: [mk(m)],
      effort: i === 0 ? "15-min" : "1-hour",
    })),
  };
  assert.match(validateSynthesis(noTop, OPTS).reason, /top-gap moat/);
});
