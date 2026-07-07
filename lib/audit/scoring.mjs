// Deep Audit — Stage 5 scoring core. The ONE place the proprietary 6-MOAT
// formulas live. Pure + dependency-free (like lib/vertical.mjs) so it runs under
// Node's test runner (scripts/test-audit-scoring.mjs) with no build step and is
// imported by the (later) Stage-5 wrapper that reads/writes the DB. Types:
// lib/audit/scoring.d.ts.
//
// CONTRACT
//   scoreEntity(entitySignals, moatConfig, metricDefs, opts) → { moatScores,
//   summary, config_version }. It takes the audit_signals rows for ONE entity
//   and returns computed moat_scores + a summary. Zero I/O. The wrapper calls it
//   once per entity — self AND every competitor go through the identical path.
//
// PORTED VERBATIM FROM AIRTABLE — this is the spec, not a reinvention. The six
// moats, their tier thresholds, and the summary weights are fixed.
//
// BLANK HANDLING (governs parity):
//   * Score: each IF-chain is evaluated faithfully. A null input fails every
//     `>=` comparison and lands on the ELSE branch, exactly like Airtable — so
//     some else-branches are non-zero for a blank (post_frequency → 3, HTTPS
//     unchecked → −10, visibility floor → 2, market OR-guard → 0). These are
//     called out inline.
//   * LOWER-is-better chains (`<=`) get an explicit null-guard so a MISSING
//     measurement cannot be coerced to 0 and thus win the best-case reward
//     (the one deliberate divergence from Airtable's blank→0 coercion). Marked
//     "lower-is-better guard" below.
//   * Coverage (signals_measured / signals_total) is tallied INDEPENDENTLY of
//     the score: every intended input counts toward `total`; only a non-null
//     reading counts toward `measured`. Inputs with no data source in v1 are
//     tallied as intended-but-unmeasured via `t.missing()`.

// Mirror of lib/serp/config.ts NOT_FOUND_RANK, inlined to keep this module
// dependency-free. Used only for agrp (mean rank), matching scan.ts's average.
export const NOT_FOUND_RANK = 21;

// PROPOSED score bands — swap these thresholds for the Airtable bands when
// provided; nothing else changes.
export const SCORE_BANDS = [
  { min: 75, band: "Leader" },
  { min: 60, band: "Strong" },
  { min: 40, band: "Average" },
  { min: 0, band: "At-Risk" },
];

export function scoreBand(avg) {
  if (avg == null) return null;
  for (const b of SCORE_BANDS) if (avg >= b.min) return b.band;
  return SCORE_BANDS[SCORE_BANDS.length - 1].band;
}

// COVERAGE GATE (rule, not a Stage-6 afterthought). A moat we barely measured
// must be IMPOSSIBLE to recommend against: if we didn't measure it for the
// clinic, we can't credibly tell them to improve it, and it must never surface
// as a competitive "gap" or spawn plan items. So a moat is gap-eligible only
// when its own coverage clears this bar; below it, the report marks the moat
// "not yet measured" and Stage-6 prioritization skips it entirely. The moat is
// still SCORED (the number shows in the secondary detail view) — it's just
// barred from driving recommendations.
export const MIN_GAP_COVERAGE = 0.2; // 20%

// Coverage ratio for a moat score (0 when nothing measured / no inputs).
export function moatCoverage(ms) {
  const total = ms?.signals_total ?? 0;
  if (!total) return 0;
  return (ms.signals_measured ?? 0) / total;
}

// The gate: true iff this moat cleared MIN_GAP_COVERAGE (and measured >0). The
// single source of truth — Stage 6 and the report MUST consult this, never
// re-derive their own coverage rule.
export function isGapEligible(ms) {
  return (ms?.signals_measured ?? 0) > 0 && moatCoverage(ms) >= MIN_GAP_COVERAGE;
}

// plannableGaps — the ONLY door Stage 6 uses to decide which moats become plan
// actions and in what order. It computes the per-moat weighted competitive gap
// (best rival's score − ours, × the moat's weight) for the SELF entity, but
// FIRST applies the coverage gate: a not_yet_measured moat is dropped here and
// can never reach the planner, no matter how far a rival "leads" on it.
//
// It returns FRESH gap objects that deliberately exclude raw_score/score-object
// internals — so a consumer built on this output has no access path to a raw
// moat score to route around the gate. Raw scores stay reachable ONLY via the
// separate detail-view path that reads moatScores directly.
//
//   selfScores       : MoatScore[]      — the self entity's moat scores
//   rivalScoresList  : MoatScore[][]    — each competitor's moat scores
//   moatConfig       : MoatConfigRow[]  — for weight_pct
//   → gap rows, highest weighted_gap first (rival-ahead only contributes).
export function plannableGaps(selfScores, rivalScoresList, moatConfig) {
  const weightByKey = new Map(
    (moatConfig ?? []).map((m) => [m.moat_key, Number(m.weight_pct) || 0]),
  );
  const rivals = (rivalScoresList ?? []).filter(Boolean);

  const gaps = [];
  for (const ms of selfScores ?? []) {
    // THE GATE. A moat we didn't measure for the clinic is not a gap — full stop.
    if (!isGapEligible(ms)) continue;

    const weight = weightByKey.get(ms.moat_key) ?? 0;
    const selfScore = ms.score;

    // Best (highest-scoring) rival on this moat — the one setting the bar.
    let bestRivalScore = null;
    let bestRivalIndex = null;
    rivals.forEach((rs, i) => {
      const rm = (rs ?? []).find((r) => r.moat_key === ms.moat_key);
      if (!rm || rm.score == null) return;
      if (bestRivalScore == null || rm.score > bestRivalScore) {
        bestRivalScore = rm.score;
        bestRivalIndex = i;
      }
    });

    const gap = bestRivalScore == null ? null : bestRivalScore - selfScore;
    // Only a rival AHEAD of us is an opportunity; where we lead, weighted_gap 0.
    const weightedGap = gap == null ? 0 : (Math.max(0, gap) * weight) / 100;

    gaps.push({
      moat_key: ms.moat_key,
      weight_pct: weight,
      self_score: selfScore,
      best_rival_score: bestRivalScore,
      best_rival_index: bestRivalIndex,
      gap,
      weighted_gap: Math.round(weightedGap * 100) / 100,
    });
  }

  // Biggest weighted gap first; deterministic ties by weight then key.
  gaps.sort(
    (a, b) =>
      b.weighted_gap - a.weighted_gap ||
      b.weight_pct - a.weight_pct ||
      (a.moat_key < b.moat_key ? -1 : a.moat_key > b.moat_key ? 1 : 0),
  );
  return gaps;
}

const round1 = (n) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------------------
// Grid helpers — the connection to the map-rank module (F1). deriveGridPins
// turns a scan's grid_points into the pin counts Stage 1 will persist as `grid`
// signals; visibilityScore / deadZonePct are computed at score time from those
// counts. Self only — competitors carry no grid (by design).
// ---------------------------------------------------------------------------

// Classify each grid cell by the target's rank: green ≤3, yellow 4–10, red
// 11–20, out = null (not found) or >20. Also mean rank (agrp) and rank spread.
export function deriveGridPins(gridPoints, notFoundRank = NOT_FOUND_RANK) {
  const pts = gridPoints ?? [];
  const total = pts.length;
  let green = 0,
    yellow = 0,
    red = 0,
    out = 0,
    sum = 0,
    found = 0,
    min = null,
    max = null;
  for (const p of pts) {
    const rank = p?.rank ?? null;
    sum += rank == null ? notFoundRank : rank;
    if (rank != null && rank <= 3) green++;
    else if (rank != null && rank <= 10) yellow++;
    else if (rank != null && rank <= 20) red++;
    else out++; // null or >20
    if (rank != null) {
      found++;
      min = min == null ? rank : Math.min(min, rank);
      max = max == null ? rank : Math.max(max, rank);
    }
  }
  return {
    green_pins: green,
    yellow_pins: yellow,
    red_pins: red,
    out_pins: out,
    total_pins: total,
    agrp: total > 0 ? round1(sum / total) : null,
    // Consistency of ranking across the grid; null when <2 cells rank at all so
    // a clinic that ranks nowhere doesn't get the "tight spread" reward.
    rank_spread: found >= 2 ? max - min : null,
  };
}

// MOAT 1 — Visibility Score (input to Local SEO), from the pin counts.
export function visibilityScore(pins) {
  const total = pins?.total_pins;
  if (total == null || total <= 0) return null;
  const g = pins.green_pins ?? 0;
  const y = pins.yellow_pins ?? 0;
  const r = pins.red_pins ?? 0;
  const o = pins.out_pins ?? 0;
  return round1(((g * 1.0 + y * 0.5 + r * 0.2 + o * 0.0) / total) * 100);
}

export function deadZonePct(pins) {
  const total = pins?.total_pins;
  if (total == null || total <= 0) return null;
  const r = pins.red_pins ?? 0;
  const o = pins.out_pins ?? 0;
  return round1(((o + r * 0.5) / total) * 100);
}

// ---------------------------------------------------------------------------
// Signal access + coverage tally.
// ---------------------------------------------------------------------------

function reader(signals) {
  const by = new Map();
  for (const s of signals ?? []) by.set(s.metric_key, s);
  const val = (k, field) => {
    const r = by.get(k);
    const v = r ? r[field] : null;
    return v === undefined ? null : v;
  };
  return {
    num: (k) => val(k, "value_number"),
    bool: (k) => val(k, "value_bool"),
    text: (k) => val(k, "value_text"),
    has: (k) => by.has(k),
  };
}

// Tracks how much of a moat we could actually measure. input(v) records an
// intended input (measured iff non-null) and returns v for inline use;
// missing() records an intended input that has no data source in v1.
function tally() {
  let total = 0;
  let measured = 0;
  return {
    input(v) {
      total++;
      if (v !== null && v !== undefined) measured++;
      return v;
    },
    known(v) {
      total++;
      measured++;
      return v;
    },
    missing() {
      total++;
    },
    get: () => ({ measured, total }),
  };
}

// Derive the Fast/Average/Slow band from the PageSpeed mobile score we already
// collect, so the Conversion "Mobile Speed" term goes live instead of blank.
function deriveMobileSpeed(ps) {
  if (ps == null) return null;
  return ps >= 70 ? "Fast" : ps >= 50 ? "Average" : "Slow";
}

function inferHasWebsite(r) {
  const numeric = ["pagespeed_mobile", "blog_post_count"];
  const boolean = [
    "whatsapp_cta",
    "chatbot_present",
    "click_to_call_works",
    "high_ticket_services_listed",
    "faq_on_website",
  ];
  const textual = ["schema_markup_type"];
  return (
    numeric.some((k) => r.num(k) != null) ||
    boolean.some((k) => r.bool(k) != null) ||
    textual.some((k) => r.text(k) != null)
  );
}

// ---------------------------------------------------------------------------
// The six moat scorers. Each returns { score, measured, total } (Local SEO also
// returns detail for Stage-6 evidence). Scores are clamped to the moat's
// max_score in scoreEntity, not here.
// ---------------------------------------------------------------------------

function scoreLocalSeo(r) {
  const t = tally();
  const pins = {
    total_pins: r.num("total_pins"),
    green_pins: r.num("green_pins"),
    yellow_pins: r.num("yellow_pins"),
    red_pins: r.num("red_pins"),
    out_pins: r.num("out_pins"),
  };
  const vis = visibilityScore(pins);
  t.input(pins.total_pins); // visibility measured iff the grid was scanned
  t.missing(); // keywords scanned — no metric in v1
  const spread = t.input(r.num("rank_spread"));
  const hindi = t.input(r.num("hindi_search_rank"));
  const nap = t.input(r.text("nap_consistency"));
  const catCount = t.input(r.num("category_count"));
  const practitioner = t.input(r.bool("practitioner_gbp_listing"));
  const kwStuffed = t.input(r.bool("keywords_in_gbp_services"));
  const blog = t.input(r.num("blog_post_count"));
  const nameViol = t.input(r.text("gbp_name_violation"));
  const https = t.input(r.bool("https_ssl"));
  const ps = t.input(r.num("pagespeed_mobile"));
  const cwv = t.input(r.text("core_web_vitals_pass"));
  t.missing(); // indexed pages — no metric in v1

  let s = 0;
  // Visibility band (null grid → floor 2, matching the Airtable else).
  s +=
    vis == null
      ? 2
      : vis >= 80
        ? 25
        : vis >= 60
          ? 18
          : vis >= 40
            ? 12
            : vis >= 20
              ? 6
              : 2;
  // Keywords scanned (no v1 source) → 0.
  s += 0;
  // Rank spread (lower-is-better guard: null → 0).
  s += spread == null ? 0 : spread <= 3 ? 10 : spread <= 7 ? 5 : 0;
  // Hindi/vernacular rank (lower-is-better guard: null → 0).
  s += hindi == null ? 0 : hindi <= 3 ? 10 : hindi <= 10 ? 5 : 0;
  // NAP consistency.
  s += nap === "Consistent" ? 15 : nap === "Minor Issues" ? 8 : 0;
  // GBP category count.
  s += catCount >= 5 ? 8 : catCount >= 3 ? 4 : 0;
  // Practitioner GBP listing.
  s += practitioner === true ? 7 : 0;
  // Keyword-stuffed GBP services — PENALTY (ruling: −8 when stuffed).
  s += kwStuffed === true ? -8 : 0;
  // Blog posts.
  s += blog >= 10 ? 7 : blog >= 5 ? 4 : 0;
  // GBP name violation penalty.
  s +=
    nameViol === "Severe"
      ? -15
      : nameViol === "Moderate"
        ? -10
        : nameViol === "Mild"
          ? -5
          : 0;
  // HTTPS: unchecked → −10. A null (no site / not measured) is falsy → −10,
  // faithful to the Airtable blank-checkbox behavior.
  s += https === true ? 0 : -10;
  // PageSpeed mobile.
  s += ps == null ? 0 : ps >= 70 ? 5 : ps >= 50 ? -3 : ps > 0 ? -8 : 0;
  // Core Web Vitals.
  s += cwv === "Fail" ? -5 : 0;
  // Indexed pages (no v1 source) → 0.
  s += 0;

  return {
    score: s,
    ...t.get(),
    detail: { visibility: vis, dead_zone_pct: deadZonePct(pins) },
  };
}

function scoreTrust(r) {
  const t = tally();
  const rating = t.input(r.num("avg_google_rating"));
  const reviews = t.input(r.num("total_google_reviews"));
  t.missing(); // Bad Review % — no metric in v1
  const badPct = null;
  const replyPct = t.input(r.num("review_reply_pct"));
  const photo = t.input(r.num("photo_count"));

  let s = 0;
  s +=
    rating >= 4.8
      ? 30
      : rating >= 4.5
        ? 25
        : rating >= 4.0
          ? 20
          : rating >= 3.5
            ? 15
            : 5;
  s +=
    reviews >= 200
      ? 31
      : reviews >= 100
        ? 25
        : reviews >= 50
          ? 18
          : reviews >= 20
            ? 12
            : 5;
  // Bad review penalty (null → 0).
  s += badPct != null && badPct > 0.2 ? -10 : badPct != null && badPct > 0.1 ? -5 : 0;
  // Reply/bad-review bonus.
  s +=
    badPct != null && badPct >= 0.8
      ? 23
      : replyPct != null && replyPct >= 0.5
        ? 15
        : badPct != null && badPct >= 0.2
          ? 8
          : 0;
  // Photo count.
  s += photo >= 15 ? 16 : photo >= 8 ? 12 : 0;
  return { score: s, ...t.get() };
}

function scoreConversion(r, hasWebsite) {
  const t = tally();
  const booking = t.input(r.bool("booking_link_present"));
  const wa = t.input(r.bool("whatsapp_cta"));
  const method = t.input(r.text("appointment_booking_method"));
  t.missing(); // Google-WA Gap Score — no metric in v1
  const gap = null;
  const highTicket = t.input(r.bool("high_ticket_services_listed"));
  const web = t.known(hasWebsite); // always known (from entity.website_url)
  const chatbot = t.input(r.bool("chatbot_present"));
  const ps = t.input(r.num("pagespeed_mobile")); // → Mobile Speed band
  const mobileSpeed = deriveMobileSpeed(ps);
  const c2c = t.input(r.bool("click_to_call_works"));

  let s = 0;
  s += booking === true ? 15 : 0;
  s += wa === true ? 15 : 0;
  s += method === "Online" ? 15 : method === "WhatsApp" ? 10 : method === "Phone Only" ? 5 : 0;
  // Google-WA gap (lower-is-better guard: null → 0). The Airtable formula's
  // third branch (`<= 3` again) is dead code; ported faithfully as unreachable.
  s += gap == null ? 0 : gap <= 3 ? 15 : gap <= 5 ? 10 : 0;
  s += highTicket === true ? 10 : 0;
  // Website-only sub-terms.
  if (web) {
    s += chatbot === true ? 10 : 0;
    s += mobileSpeed === "Fast" ? 10 : mobileSpeed === "Average" ? 5 : 0;
    s += c2c === true ? 10 : 0;
  }
  return { score: s, ...t.get() };
}

function scoreOpVelocity(r) {
  const t = tally();
  const recency = t.input(r.num("gbp_post_recency")); // days since last post
  const freq = t.input(r.num("post_frequency_3mo"));
  t.missing(); // Social Media Activity Score — no metric in v1
  t.missing(); // YouTube Shorts Presence — no metric in v1

  let s = 0;
  // Post recency bands (Airtable expresses these as enum labels over a day
  // count — ported as numeric-day bands; null → 0).
  s += recency == null ? 0 : recency < 7 ? 30 : recency <= 30 ? 20 : recency <= 90 ? 10 : 0;
  // Post frequency — note the ELSE is +3, so a blank still contributes 3
  // (faithful to Airtable).
  s += freq >= 12 ? 32 : freq >= 6 ? 22 : freq >= 3 ? 12 : 3;
  // Social Media Activity Score (no v1 source) → 0.
  s += 0;
  // Second recency term (numeric, lower-is-better guard: null → 0).
  s += recency == null ? 0 : recency <= 7 ? 10 : recency <= 30 ? 5 : 0;
  // YouTube Shorts Presence (no v1 source) → 0.
  s += 0;
  return { score: s, ...t.get() };
}

function scoreAiAeo(r) {
  const t = tally();
  const rate = t.input(r.num("ai_citation_rate")); // %
  // AI Citation Score = number of engines that cited self (0–4).
  const engineKeys = [
    "aio_cited",
    "perplexity_cited",
    "chatgpt_mentioned",
    "gemini_mentioned",
  ];
  let citeScore = 0;
  let anyEngine = false;
  for (const k of engineKeys) {
    const b = r.bool(k);
    if (b !== null) anyEngine = true;
    if (b === true) citeScore++;
  }
  t.input(anyEngine ? citeScore : null); // measured iff any engine reported
  const schema = t.input(r.text("schema_markup_type"));
  const faq = t.input(r.bool("faq_on_website"));
  const kp = t.input(r.text("knowledge_panel_status"));
  const bestOf = t.input(r.bool("best_of_list_presence"));
  const blog = t.input(r.num("blog_post_count"));

  let s = 0;
  s += rate >= 50 ? 35 : rate >= 25 ? 25 : rate >= 10 ? 15 : citeScore >= 1 ? 8 : 0;
  s += schema === "Dentist" ? 10 : schema === "LocalBusiness" ? 5 : 0;
  s += faq === true ? 8 : 0;
  s += kp === "Present" ? 7 : 0;
  s += bestOf === true ? 8 : 0;
  s += blog >= 10 ? 12 : blog >= 5 ? 7 : blog >= 1 ? 3 : 0;
  return { score: s, ...t.get() };
}

function scoreMarketActivity(r) {
  const t = tally();
  // Review Velocity — prefer the computed signal (run #2+), else the manual one.
  const velC = r.num("review_velocity_computed");
  const velM = r.num("review_velocity_manual");
  const velocity = velC != null ? velC : velM;
  t.input(velocity);
  t.missing(); // Total Directory Reviews — no metric in v1
  const dirReviews = null;
  const practoR = t.input(r.num("practo_rating"));
  const jdR = t.input(r.num("justdial_rating"));
  t.missing(); // Lybrate — no metric at all in v1
  const insta = t.input(r.num("instagram_followers"));

  // OR-guard: Airtable OR treats blank/0 as false — the whole moat is 0 unless
  // directory reviews OR review velocity is a non-zero measurement.
  const truthy = (v) => v != null && v !== 0 && v !== false;
  let s = 0;
  if (truthy(dirReviews) || truthy(velocity)) {
    s +=
      velocity >= 10 ? 35 : velocity >= 5 ? 25 : velocity >= 2 ? 18 : velocity >= 1 ? 10 : 4;
    s += dirReviews >= 50 ? 20 : dirReviews >= 20 ? 15 : dirReviews >= 5 ? 8 : 2;
    const practoListed = practoR != null;
    s += practoListed && practoR >= 4.0 ? 8 : practoListed ? 4 : 0;
    const jdListed = jdR != null;
    s += jdListed && jdR >= 4.0 ? 6 : jdListed ? 3 : 0;
    // Lybrate has no metric → 0.
    s += insta >= 1000 ? 25 : insta >= 500 ? 18 : insta >= 100 ? 10 : 0;
  }
  return { score: s, ...t.get() };
}

// The fixed scorer registry: [moat_key, scorer]. moat_key matches moat_config.
const MOAT_ORDER = [
  "local_seo_integrity",
  "trust_safety",
  "conversion",
  "operational_velocity",
  "ai_aeo_readiness",
  "market_activity",
];

// ---------------------------------------------------------------------------
// scoreEntity — score one entity across all six moats, then roll up to a
// summary. moatConfig = moat_config rows (weights, max_score, version).
// metricDefs is accepted for parity with the collection stages' signatures and
// future coverage use; the formulas themselves are fixed here.
// ---------------------------------------------------------------------------
export function scoreEntity(entitySignals, moatConfig, metricDefs, opts = {}) {
  const r = reader(entitySignals);
  const hasWebsite =
    opts.hasWebsite === undefined ? inferHasWebsite(r) : !!opts.hasWebsite;

  const results = {
    local_seo_integrity: scoreLocalSeo(r),
    trust_safety: scoreTrust(r),
    conversion: scoreConversion(r, hasWebsite),
    operational_velocity: scoreOpVelocity(r),
    ai_aeo_readiness: scoreAiAeo(r),
    market_activity: scoreMarketActivity(r),
  };

  const cfgByKey = new Map((moatConfig ?? []).map((m) => [m.moat_key, m]));
  const versions = (moatConfig ?? []).map((m) => Number(m.version) || 1);
  const configVersion = versions.length ? Math.max(...versions) : 1;

  const moatScores = MOAT_ORDER.map((key) => {
    const res = results[key];
    const cfg = cfgByKey.get(key);
    const max = cfg ? Number(cfg.max_score) : 100;
    // Tiers can sum past max or go negative via penalties — clamp to [0, max].
    const clamped = Math.max(0, Math.min(max, res.score));
    const coverage = res.total ? res.measured / res.total : 0;
    // Coverage gate (see MIN_GAP_COVERAGE): gap_eligible === false ⇒ this moat
    // is "not yet measured" — excluded from weighted-gap prioritization and
    // barred from producing plan items; shown in the report as such.
    const eligible = res.measured > 0 && coverage >= MIN_GAP_COVERAGE;
    const row = {
      moat_key: key,
      score: clamped,
      raw_score: res.score, // pre-clamp, for the "how we calculated" view
      max_score: max,
      signals_measured: res.measured,
      signals_total: res.total,
      config_version: configVersion,
      coverage: Math.round(coverage * 100) / 100,
      gap_eligible: eligible,
      measurement_status: eligible ? "measured" : "not_yet_measured",
    };
    if (res.detail) row.detail = res.detail;
    return row;
  });

  // Average Digital Score — Σ(score × weight_pct) / 100. Full weight, NOT
  // re-normalized for coverage: a blank-heavy moat still counts at full weight
  // with a low score (so v1's manual-blank moats correctly drag the average).
  // Divide by the spec's 100 so weights that sum to 100 map a 0–100 score to a
  // 0–100 average; weightSum only guards a config with zero active moats.
  let weighted = 0;
  let weightSum = 0;
  for (const ms of moatScores) {
    const cfg = cfgByKey.get(ms.moat_key);
    if (!cfg || cfg.is_active === false) continue;
    weighted += ms.score * (Number(cfg.weight_pct) || 0);
    weightSum += Number(cfg.weight_pct) || 0;
  }
  const average = weightSum > 0 ? round1(weighted / 100) : null;
  const band = scoreBand(average);

  // Summary revenue math: the band + share + leakage formulas are NOT YET
  // provided. Per the "don't reinvent" rule they stay null until the Airtable
  // formulas land. The gating (self + all three market inputs present) is wired
  // so filling them in is a one-spot change.
  const market = opts.market ?? null;
  const isSelf = opts.entityKind === "self";
  const marketReady =
    isSelf &&
    !!market &&
    market.searchVolume != null &&
    market.avgPatientValue != null &&
    market.ltvMultiplier != null;

  const summary = {
    average_digital_score: average,
    score_band: band,
    // TODO(stage5-summary): compute the below only when `marketReady`, from the
    // Airtable expected-market-share + revenue-leak formulas (awaiting spec).
    expected_market_share_pct: null,
    fair_share_patients: null,
    actual_patients_est: null,
    leaked_patients: null,
    revenue_loss_month: null,
    annual_revenue_loss: null,
    market_ready: marketReady,
  };

  return { moatScores, summary, config_version: configVersion };
}
