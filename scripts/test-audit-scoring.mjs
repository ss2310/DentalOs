// Tests for the Deep Audit Stage-5 scoring core (lib/audit/scoring.mjs).
// Proves the six moat formulas are ported faithfully from the Airtable spec:
// every tier boundary, the blank-handling rules, coverage counting, the grid
// derivation, the weighted average, clamping, and config versioning.
//   node --test scripts/test-audit-scoring.mjs   (or: npm test)
//
// PARITY NOTE: the "worked example" test hand-computes an expected result from
// the formulas — parity with the SPEC. The real Airtable-clinic parity fixture
// (marked TODO below) awaits the hand-scored clinic's numbers.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scoreEntity,
  deriveGridPins,
  visibilityScore,
  deadZonePct,
  scoreBand,
  isGapEligible,
  moatCoverage,
  MIN_GAP_COVERAGE,
  plannableGaps,
} from "../lib/audit/scoring.mjs";

// ---- fixtures / helpers ---------------------------------------------------

// The seeded moat_config (035): weights sum to 100, max 100, version 1.
const MOAT_CONFIG = [
  { moat_key: "ai_aeo_readiness", weight_pct: 25, max_score: 100, is_active: true, version: 1 },
  { moat_key: "trust_safety", weight_pct: 20, max_score: 100, is_active: true, version: 1 },
  { moat_key: "local_seo_integrity", weight_pct: 20, max_score: 100, is_active: true, version: 1 },
  { moat_key: "conversion", weight_pct: 15, max_score: 100, is_active: true, version: 1 },
  { moat_key: "operational_velocity", weight_pct: 10, max_score: 100, is_active: true, version: 1 },
  { moat_key: "market_activity", weight_pct: 10, max_score: 100, is_active: true, version: 1 },
];

// Typed signal-row builders (one of number/bool/text per row).
const n = (metric_key, value_number) => ({ metric_key, value_number });
const b = (metric_key, value_bool) => ({ metric_key, value_bool });
const x = (metric_key, value_text) => ({ metric_key, value_text });

const score = (signals, opts) => scoreEntity(signals, MOAT_CONFIG, null, opts);
const moat = (out, key) => out.moatScores.find((m) => m.moat_key === key);
// Score a single moat in isolation, returning its raw (pre-clamp) score.
const raw = (signals, key, opts) => moat(score(signals, opts), key).raw_score;

// ---- grid derivation ------------------------------------------------------

test("deriveGridPins classifies green/yellow/red/out + agrp + spread", () => {
  const grid = [1, 2, 3, 4, 10, 11, 20, null, 25, null].map((rank) => ({ rank }));
  const p = deriveGridPins(grid);
  assert.equal(p.green_pins, 3); // 1,2,3
  assert.equal(p.yellow_pins, 2); // 4,10
  assert.equal(p.red_pins, 2); // 11,20
  assert.equal(p.out_pins, 3); // null,25,null
  assert.equal(p.total_pins, 10);
  // sum = 1+2+3+4+10+11+20+25 + 21+21 (two nulls) = 118 → /10 = 11.8
  assert.equal(p.agrp, 11.8);
  assert.equal(p.rank_spread, 24); // max 25 − min 1
});

test("deriveGridPins: rank_spread is null when fewer than 2 cells rank", () => {
  assert.equal(deriveGridPins([{ rank: 5 }, { rank: null }]).rank_spread, null);
  assert.equal(deriveGridPins([]).rank_spread, null);
  assert.equal(deriveGridPins([]).agrp, null);
});

test("visibilityScore + deadZonePct arithmetic, null on empty grid", () => {
  const pins = { green_pins: 3, yellow_pins: 2, red_pins: 2, out_pins: 3, total_pins: 10 };
  assert.equal(visibilityScore(pins), 44.0); // (3 + 1 + 0.4 + 0)/10*100
  assert.equal(deadZonePct(pins), 40.0); // (3 + 1)/10*100
  assert.equal(visibilityScore({ total_pins: 0 }), null);
  assert.equal(deadZonePct({ total_pins: null }), null);
});

// ---- Local SEO Integrity --------------------------------------------------

const gridSignals = (green, total) => [
  n("green_pins", green),
  n("yellow_pins", 0),
  n("red_pins", 0),
  n("out_pins", total - green),
  n("total_pins", total),
];

test("Local SEO: visibility bands (80/60/40/20/floor + no-grid floor)", () => {
  // Each band is compared against the same all-else-blank baseline (no grid →
  // visibility floor 2, plus the null-HTTPS −10 penalty), isolating the band.
  const base = raw([], "local_seo_integrity");
  assert.equal(raw(gridSignals(8, 10), "local_seo_integrity") - base, 25 - 2);
  assert.equal(raw(gridSignals(6, 10), "local_seo_integrity") - base, 18 - 2);
  assert.equal(raw(gridSignals(4, 10), "local_seo_integrity") - base, 12 - 2);
  assert.equal(raw(gridSignals(2, 10), "local_seo_integrity") - base, 6 - 2);
  assert.equal(raw(gridSignals(1, 10), "local_seo_integrity") - base, 2 - 2);
});

test("Local SEO: HTTPS unchecked/null → −10, checked → 0", () => {
  const withHttps = raw([b("https_ssl", true)], "local_seo_integrity");
  const nullHttps = raw([], "local_seo_integrity");
  const falseHttps = raw([b("https_ssl", false)], "local_seo_integrity");
  assert.equal(withHttps - nullHttps, 10); // removing the −10 penalty
  assert.equal(falseHttps, nullHttps); // false and null both penalize −10
});

test("Local SEO: keyword-stuffing is a −8 PENALTY", () => {
  const base = raw([b("https_ssl", true)], "local_seo_integrity");
  assert.equal(raw([b("https_ssl", true), b("keywords_in_gbp_services", true)], "local_seo_integrity"), base - 8);
  assert.equal(raw([b("https_ssl", true), b("keywords_in_gbp_services", false)], "local_seo_integrity"), base);
});

test("Local SEO: GBP name violation penalties", () => {
  const base = raw([b("https_ssl", true)], "local_seo_integrity");
  const withV = (v) => raw([b("https_ssl", true), x("gbp_name_violation", v)], "local_seo_integrity");
  assert.equal(withV("None"), base);
  assert.equal(withV("Mild"), base - 5);
  assert.equal(withV("Moderate"), base - 10);
  assert.equal(withV("Severe"), base - 15);
});

test("Local SEO: PageSpeed bands (70/69/50/49/0/null)", () => {
  const base = raw([b("https_ssl", true)], "local_seo_integrity");
  const ps = (v) => raw([b("https_ssl", true), n("pagespeed_mobile", v)], "local_seo_integrity");
  assert.equal(ps(70) - base, 5);
  assert.equal(ps(69) - base, -3);
  assert.equal(ps(50) - base, -3);
  assert.equal(ps(49) - base, -8);
  assert.equal(ps(0) - base, 0); // >0 is false → 0
  assert.equal(raw([b("https_ssl", true)], "local_seo_integrity"), base); // null → 0
});

test("Local SEO: NAP, category count, blog, hindi, rank-spread tiers", () => {
  const base = raw([b("https_ssl", true)], "local_seo_integrity");
  const one = (s) => raw([b("https_ssl", true), ...s], "local_seo_integrity") - base;
  assert.equal(one([x("nap_consistency", "Consistent")]), 15);
  assert.equal(one([x("nap_consistency", "Minor Issues")]), 8);
  assert.equal(one([n("category_count", 5)]), 8);
  assert.equal(one([n("category_count", 3)]), 4);
  assert.equal(one([n("category_count", 2)]), 0);
  assert.equal(one([n("blog_post_count", 10)]), 7);
  assert.equal(one([n("blog_post_count", 5)]), 4);
  assert.equal(one([n("hindi_search_rank", 3)]), 10);
  assert.equal(one([n("hindi_search_rank", 10)]), 5);
  assert.equal(one([n("rank_spread", 3)]), 10);
  assert.equal(one([n("rank_spread", 7)]), 5);
  assert.equal(one([n("rank_spread", 8)]), 0);
});

// ---- Trust & Safety -------------------------------------------------------

test("Trust: rating bands", () => {
  const r = (v) => raw([n("avg_google_rating", v)], "trust_safety");
  // reviews null → +5 floor is shared; subtract it to isolate the rating tier.
  const floor = raw([], "trust_safety"); // 5 (rating else) + 5 (reviews else) = 10
  assert.equal(r(4.8) - floor, 30 - 5);
  assert.equal(r(4.5) - floor, 25 - 5);
  assert.equal(r(4.0) - floor, 20 - 5);
  assert.equal(r(3.5) - floor, 15 - 5);
  assert.equal(r(3.49) - floor, 0);
});

test("Trust: reviews + photo bands", () => {
  const floor = raw([], "trust_safety");
  const rv = (v) => raw([n("total_google_reviews", v)], "trust_safety") - floor;
  assert.equal(rv(200), 31 - 5);
  assert.equal(rv(100), 25 - 5);
  assert.equal(rv(50), 18 - 5);
  assert.equal(rv(20), 12 - 5);
  assert.equal(rv(19), 0);
  const ph = (v) => raw([n("photo_count", v)], "trust_safety") - floor;
  assert.equal(ph(15), 16);
  assert.equal(ph(8), 12);
  assert.equal(ph(7), 0);
});

// ---- Conversion -----------------------------------------------------------

test("Conversion: booking method tiers + website gating", () => {
  const method = (m) => raw([x("appointment_booking_method", m)], "conversion", { hasWebsite: false });
  assert.equal(method("Online"), 15);
  assert.equal(method("WhatsApp"), 10);
  assert.equal(method("Phone Only"), 5);
  assert.equal(method("None"), 0);
  // Website-only sub-terms are ignored when there is no website.
  const noWeb = raw([b("chatbot_present", true), b("click_to_call_works", true), n("pagespeed_mobile", 90)], "conversion", { hasWebsite: false });
  assert.equal(noWeb, 0);
  const web = raw([b("chatbot_present", true), b("click_to_call_works", true), n("pagespeed_mobile", 90)], "conversion", { hasWebsite: true });
  assert.equal(web, 10 + 10 + 10); // chatbot + Fast mobile + click-to-call
});

test("Conversion: mobile-speed band derived from pagespeed", () => {
  const ms = (ps) => raw([n("pagespeed_mobile", ps)], "conversion", { hasWebsite: true });
  assert.equal(ms(70), 10); // Fast
  assert.equal(ms(50), 5); // Average
  assert.equal(ms(49), 0); // Slow
});

// ---- Operational Velocity -------------------------------------------------

test("Op velocity: blank clinic scores 3 (post-frequency else branch)", () => {
  assert.equal(raw([], "operational_velocity"), 3);
});

test("Op velocity: frequency + recency tiers", () => {
  const fq = (v) => raw([n("post_frequency_3mo", v)], "operational_velocity");
  assert.equal(fq(12), 32);
  assert.equal(fq(6), 22);
  assert.equal(fq(3), 12);
  assert.equal(fq(2), 3); // else
  // recency contributes to two terms (band + numeric). freq null → +3 baseline.
  const rc = (v) => raw([n("gbp_post_recency", v)], "operational_velocity") - 3;
  assert.equal(rc(6), 30 + 10); // <7 band + <=7 numeric
  assert.equal(rc(30), 20 + 5); // 7–30 band + <=30 numeric
  assert.equal(rc(90), 10 + 0); // 30–90 band + (>30 numeric → 0)
});

// ---- AI / AEO Readiness ---------------------------------------------------

test("AI/AEO: citation-rate bands + engines-cited fallback", () => {
  const rate = (v) => raw([n("ai_citation_rate", v)], "ai_aeo_readiness");
  assert.equal(rate(50), 35);
  assert.equal(rate(25), 25);
  assert.equal(rate(10), 15);
  assert.equal(rate(9), 0); // no engine bools → citeScore 0
  // rate below 10 but an engine cited → the 8-pt fallback.
  assert.equal(raw([n("ai_citation_rate", 5), b("perplexity_cited", true)], "ai_aeo_readiness"), 8);
  assert.equal(raw([b("perplexity_cited", false), b("aio_cited", false)], "ai_aeo_readiness"), 0);
});

test("AI/AEO: schema + faq + knowledge panel + best-of + blog", () => {
  const one = (s) => raw(s, "ai_aeo_readiness");
  assert.equal(one([x("schema_markup_type", "Dentist")]), 10);
  assert.equal(one([x("schema_markup_type", "LocalBusiness")]), 5);
  assert.equal(one([b("faq_on_website", true)]), 8);
  assert.equal(one([x("knowledge_panel_status", "Present")]), 7);
  assert.equal(one([b("best_of_list_presence", true)]), 8);
  assert.equal(one([n("blog_post_count", 10)]), 12);
  assert.equal(one([n("blog_post_count", 5)]), 7);
  assert.equal(one([n("blog_post_count", 1)]), 3);
});

// ---- Market Activity ------------------------------------------------------

test("Market activity: OR-guard → 0 when no velocity/directory reviews", () => {
  assert.equal(raw([], "market_activity"), 0);
  assert.equal(raw([n("review_velocity_manual", 0)], "market_activity"), 0); // 0 is falsy
});

test("Market activity: velocity bands + directory-review floor + listings", () => {
  const v = (val) => raw([n("review_velocity_computed", val)], "market_activity");
  // velocity band + dirReviews null→2 floor.
  assert.equal(v(10), 35 + 2);
  assert.equal(v(5), 25 + 2);
  assert.equal(v(2), 18 + 2);
  assert.equal(v(1), 10 + 2);
  assert.equal(v(0.5), 4 + 2); // >0 passes the guard, lands on velocity else
  // Practo/JustDial listing tiers (guard satisfied by velocity).
  assert.equal(raw([n("review_velocity_computed", 5), n("practo_rating", 4.2)], "market_activity"), 25 + 2 + 8);
  assert.equal(raw([n("review_velocity_computed", 5), n("practo_rating", 3.5)], "market_activity"), 25 + 2 + 4);
  assert.equal(raw([n("review_velocity_computed", 5), n("instagram_followers", 1000)], "market_activity"), 25 + 2 + 25);
});

test("Market activity prefers computed velocity over manual", () => {
  assert.equal(raw([n("review_velocity_computed", 10), n("review_velocity_manual", 1)], "market_activity"), 35 + 2);
});

// ---- coverage, clamp, average, config version -----------------------------

test("coverage: signals_measured / signals_total is honest per moat", () => {
  const out = score([n("avg_google_rating", 4.9), n("total_google_reviews", 130), n("photo_count", 12)]);
  const trust = moat(out, "trust_safety");
  assert.equal(trust.signals_total, 5); // rating, reviews, bad%, reply%, photo
  assert.equal(trust.signals_measured, 3); // rating, reviews, photo
  const opv = moat(out, "operational_velocity");
  assert.equal(opv.signals_total, 4);
  assert.equal(opv.signals_measured, 0); // all manual/absent in v1
});

test("moat scores clamp to [0, max] but keep raw_score", () => {
  // Only penalties → negative raw, clamped to 0.
  const signals = [
    x("gbp_name_violation", "Severe"), // −15
    b("keywords_in_gbp_services", true), // −8
    n("pagespeed_mobile", 49), // −8
    x("core_web_vitals_pass", "Fail"), // −5
    // https null → −10, vis null → +2
  ];
  const ls = moat(score(signals), "local_seo_integrity");
  assert.equal(ls.raw_score, 2 - 10 - 15 - 8 - 8 - 5);
  assert.equal(ls.score, 0); // clamped
});

test("config_version flows from moat_config into every moat score", () => {
  const cfg = MOAT_CONFIG.map((m) => ({ ...m, version: 2 }));
  const out = scoreEntity([], cfg, null, {});
  assert.equal(out.config_version, 2);
  for (const m of out.moatScores) assert.equal(m.config_version, 2);
});

test("coverage gate: unmeasured / low-coverage moats are NOT gap-eligible", () => {
  assert.equal(MIN_GAP_COVERAGE, 0.2);
  // A moat with 0 measured inputs is excluded and marked not-yet-measured.
  assert.equal(isGapEligible({ signals_measured: 0, signals_total: 4 }), false);
  // Below 20% coverage → excluded (1/6 ≈ 0.167).
  assert.equal(isGapEligible({ signals_measured: 1, signals_total: 6 }), false);
  // At/above 20% → eligible.
  assert.equal(isGapEligible({ signals_measured: 2, signals_total: 6 }), true); // 0.333
  assert.equal(isGapEligible({ signals_measured: 3, signals_total: 5 }), true);
  // No inputs at all → coverage 0, excluded.
  assert.equal(moatCoverage({ signals_measured: 0, signals_total: 0 }), 0);
  assert.equal(isGapEligible({ signals_measured: 0, signals_total: 0 }), false);
});

test("gate: Operational Velocity + Market Activity are 'not_yet_measured' in v1", () => {
  // A realistic run #1 self entity: places + website + AI collected, but the
  // manual-only OpVelocity / MarketActivity inputs are absent.
  const out = score(
    [
      n("avg_google_rating", 4.7), n("total_google_reviews", 90), n("photo_count", 10),
      n("category_count", 4), b("https_ssl", true), n("pagespeed_mobile", 68),
      b("whatsapp_cta", true), x("appointment_booking_method", "Online"),
      n("ai_citation_rate", 20), b("perplexity_cited", true),
      n("green_pins", 4), n("yellow_pins", 3), n("red_pins", 2), n("out_pins", 1), n("total_pins", 10),
    ],
    { entityKind: "self", hasWebsite: true },
  );
  const opv = moat(out, "operational_velocity");
  const mkt = moat(out, "market_activity");
  assert.equal(opv.gap_eligible, false);
  assert.equal(opv.measurement_status, "not_yet_measured");
  assert.equal(mkt.gap_eligible, false);
  assert.equal(mkt.measurement_status, "not_yet_measured");
  // The measured moats stay eligible — the gate only bars the unmeasured ones.
  assert.equal(moat(out, "trust_safety").gap_eligible, true);
  assert.equal(moat(out, "ai_aeo_readiness").gap_eligible, true);
  assert.equal(moat(out, "local_seo_integrity").gap_eligible, true);
  assert.equal(moat(out, "conversion").gap_eligible, true);
  // ...and they are still SCORED (the gate excludes from gaps, not from scoring).
  assert.ok(opv.score >= 0 && "score" in opv);
});

// ---- plannableGaps — the single planning door -----------------------------

// Minimal moat-score shape plannableGaps reads (moat_key, score, coverage bits).
const ms = (moat_key, sc, measured, total) => ({
  moat_key,
  score: sc,
  signals_measured: measured,
  signals_total: total,
});

test("plannableGaps: a not_yet_measured moat NEVER appears — even if a rival crushes us there", () => {
  const self = [
    ms("trust_safety", 60, 3, 5), // eligible
    ms("operational_velocity", 3, 0, 4), // NOT measured
    ms("market_activity", 0, 0, 6), // NOT measured
  ];
  const rival = [
    ms("trust_safety", 80, 3, 5),
    ms("operational_velocity", 95, 3, 4), // rival dominates the unmeasured moats
    ms("market_activity", 90, 4, 6),
  ];
  const gaps = plannableGaps(self, [rival], MOAT_CONFIG);
  const keys = gaps.map((g) => g.moat_key);
  assert.deepEqual(keys, ["trust_safety"]); // ONLY the measured moat survives
  assert.ok(!keys.includes("operational_velocity"));
  assert.ok(!keys.includes("market_activity"));
  // (80 − 60) × 20/100 = 4
  assert.equal(gaps[0].weighted_gap, 4);
  // The planning door exposes NO raw score to route around the gate.
  assert.ok(!("raw_score" in gaps[0]));
});

test("plannableGaps: real scoreEntity output — unmeasured moats dropped vs a rival scoring 95 everywhere", () => {
  const selfOut = score(
    [
      n("avg_google_rating", 4.7), n("total_google_reviews", 90), n("photo_count", 10),
      n("category_count", 4), b("https_ssl", true), n("pagespeed_mobile", 68),
      b("whatsapp_cta", true), x("appointment_booking_method", "Online"),
      n("ai_citation_rate", 20), b("perplexity_cited", true),
      n("green_pins", 4), n("yellow_pins", 3), n("red_pins", 2), n("out_pins", 1), n("total_pins", 10),
    ],
    { entityKind: "self", hasWebsite: true },
  );
  // A rival that "wins" every moat, including the ones we didn't measure.
  const rival = selfOut.moatScores.map((m) => ms(m.moat_key, 95, 5, 5));
  const keys = plannableGaps(selfOut.moatScores, [rival], MOAT_CONFIG).map((g) => g.moat_key);
  assert.ok(!keys.includes("operational_velocity"));
  assert.ok(!keys.includes("market_activity"));
  assert.deepEqual(
    keys.sort(),
    ["ai_aeo_readiness", "conversion", "local_seo_integrity", "trust_safety"],
  );
});

test("plannableGaps: ranks by weighted gap, picks the strongest rival", () => {
  const self = [
    ms("ai_aeo_readiness", 40, 5, 7),
    ms("conversion", 70, 7, 9),
    ms("local_seo_integrity", 32, 10, 14),
  ];
  const rivalA = [ms("ai_aeo_readiness", 60, 5, 7), ms("conversion", 72, 7, 9), ms("local_seo_integrity", 50, 10, 14)];
  const rivalB = [ms("ai_aeo_readiness", 80, 5, 7), ms("conversion", 60, 7, 9), ms("local_seo_integrity", 40, 10, 14)];
  const gaps = plannableGaps(self, [rivalA, rivalB], MOAT_CONFIG);
  // ai: rival 80 (B), (80−40)×25/100 = 10.0
  // localseo: rival 50 (A), (50−32)×20/100 = 3.6
  // conversion: rival 72 (A), (72−70)×15/100 = 0.3
  assert.deepEqual(gaps.map((g) => g.moat_key), ["ai_aeo_readiness", "local_seo_integrity", "conversion"]);
  assert.equal(gaps[0].weighted_gap, 10);
  assert.equal(gaps[0].best_rival_index, 1); // rivalB set the bar on AI
  assert.equal(gaps[1].weighted_gap, 3.6);
  assert.equal(gaps[2].weighted_gap, 0.3);
});

test("plannableGaps: where we lead → weighted_gap 0; no rivals → gap null but still eligible", () => {
  const self = [ms("trust_safety", 90, 3, 5)];
  let g = plannableGaps(self, [[ms("trust_safety", 70, 3, 5)]], MOAT_CONFIG)[0];
  assert.equal(g.gap, -20);
  assert.equal(g.weighted_gap, 0); // leading is not an opportunity
  g = plannableGaps(self, [], MOAT_CONFIG)[0];
  assert.equal(g.best_rival_score, null);
  assert.equal(g.gap, null);
  assert.equal(g.weighted_gap, 0);
});

test("scoreBand thresholds (proposed)", () => {
  assert.equal(scoreBand(75), "Leader");
  assert.equal(scoreBand(60), "Strong");
  assert.equal(scoreBand(40), "Average");
  assert.equal(scoreBand(39.9), "At-Risk");
  assert.equal(scoreBand(null), null);
});

// ---- worked example: parity with the formula SPEC -------------------------

test("worked example: full self entity → hand-computed moats + average", () => {
  const signals = [
    // grid → visibility 44 → band 12
    n("green_pins", 3), n("yellow_pins", 2), n("red_pins", 2), n("out_pins", 3), n("total_pins", 10),
    n("rank_spread", 5), // 5≤7 → 5
    x("nap_consistency", "Consistent"), // 15
    n("category_count", 4), // 4
    b("keywords_in_gbp_services", true), // −8
    n("blog_post_count", 6), // Local SEO +4 ; AI +7
    x("gbp_name_violation", "Mild"), // −5
    b("https_ssl", true), // 0
    n("pagespeed_mobile", 72), // Local SEO +5 ; Conversion Fast +10
    x("core_web_vitals_pass", "Pass"), // 0
    // trust
    n("avg_google_rating", 4.9), // 30
    n("total_google_reviews", 130), // 25
    n("photo_count", 12), // 12
    // conversion
    b("whatsapp_cta", true), // 15
    x("appointment_booking_method", "Online"), // 15
    b("high_ticket_services_listed", true), // 10
    b("chatbot_present", true), // 10
    b("click_to_call_works", true), // 10
    // ai/aeo
    n("ai_citation_rate", 16.7), // 15
    b("perplexity_cited", true), b("aio_cited", false), b("chatgpt_mentioned", false), b("gemini_mentioned", false),
    x("schema_markup_type", "Dentist"), // 10
    b("faq_on_website", true), // 8
  ];
  const out = score(signals, { entityKind: "self", hasWebsite: true });

  assert.equal(moat(out, "local_seo_integrity").score, 32);
  assert.equal(moat(out, "trust_safety").score, 67);
  assert.equal(moat(out, "conversion").score, 70);
  assert.equal(moat(out, "operational_velocity").score, 3);
  assert.equal(moat(out, "ai_aeo_readiness").score, 40);
  assert.equal(moat(out, "market_activity").score, 0);

  // Σ(score × weight)/100 = (40*25 + 67*20 + 32*20 + 70*15 + 3*10 + 0*10)/100
  assert.equal(out.summary.average_digital_score, 40.6);
  assert.equal(out.summary.score_band, "Average");
  // Local SEO visibility surfaces for Stage-6 evidence.
  assert.deepEqual(moat(out, "local_seo_integrity").detail, { visibility: 44, dead_zone_pct: 40 });
});

test("summary: revenue math gated to self + market inputs (null until formulas land)", () => {
  const market = { searchVolume: 5000, avgPatientValue: 8000, ltvMultiplier: 3 };
  const self = score([], { entityKind: "self", market });
  assert.equal(self.summary.market_ready, true);
  assert.equal(self.summary.revenue_loss_month, null); // formula not yet provided
  // Competitor never gets revenue math.
  assert.equal(score([], { entityKind: "competitor", market }).summary.market_ready, false);
  // Self missing an input → not ready.
  assert.equal(score([], { entityKind: "self", market: { searchVolume: 5000 } }).summary.market_ready, false);
});

// TODO(parity): replace with the hand-scored Airtable clinic once its inputs +
// expected per-moat/average outputs are provided, asserting exact parity.
