// Stage 6 — synthesis VALIDATOR. Pure + dependency-free (node --test). The
// reject-and-retry gate: it makes an action without a measured justification
// IMPOSSIBLE. The wrapper retries the Claude call while this returns not-ok,
// then fails the stage rather than persist a weak plan.

const EFFORTS = new Set(["15-min", "1-hour", "needs-help"]);

const isNonEmptyStr = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * @param {any} json  the parsed model output
 * @param {object} opts
 *  - eligibleMetricKeys: string[]           metric_keys of gap-eligible moats
 *  - metricToMoat:       {metric_key: moat}  for the theme cap
 *  - gapOrder:           string[]            moat_keys by weighted gap desc
 *  - minItems=12, maxItems=15, themeCap=5, quickWinBy=5, topGapBy=5
 * @returns {{ok:true, plan:any[]}|{ok:false, reason:string}}
 */
export function validateSynthesis(json, opts = {}) {
  const {
    eligibleMetricKeys = [],
    metricToMoat = {},
    gapOrder = [],
    minItems = 12,
    maxItems = 15,
    themeCap = 5,
    quickWinBy = 5,
    topGapBy = 5,
  } = opts;
  const eligible = new Set(eligibleMetricKeys);

  if (!json || typeof json !== "object") return fail("not a JSON object");
  if (!isNonEmptyStr(json.headline)) return fail("headline missing/empty");

  const story = json.competitor_story;
  if (!Array.isArray(story) || story.length < 3 || story.length > 5) {
    return fail("competitor_story must have 3-5 entries");
  }
  if (!story.every(isNonEmptyStr)) return fail("competitor_story has an empty entry");

  const plan = json.plan;
  if (!Array.isArray(plan)) return fail("plan is not an array");
  if (plan.length < minItems || plan.length > maxItems) {
    return fail(`plan must have ${minItems}-${maxItems} items (got ${plan.length})`);
  }

  const perMoat = {};
  let hasEarlyQuickWin = false;

  for (let i = 0; i < plan.length; i++) {
    const it = plan[i];
    const at = `item ${i + 1}`;
    if (!it || typeof it !== "object") return fail(`${at} not an object`);

    const day = it.day_number;
    if (!Number.isInteger(day) || day < 1 || day > 15) {
      return fail(`${at} day_number must be an integer 1-15`);
    }
    if (!isNonEmptyStr(it.title)) return fail(`${at} title missing`);
    if (!isNonEmptyStr(it.description)) return fail(`${at} description missing`);
    // The core rule: a measured justification is mandatory.
    if (!isNonEmptyStr(it.evidence)) return fail(`${at} evidence missing`);
    if (!isNonEmptyStr(it.competitor_context)) {
      return fail(`${at} competitor_context missing`);
    }
    if (!EFFORTS.has(it.effort)) return fail(`${at} effort invalid`);

    const keys = it.metric_keys;
    if (!Array.isArray(keys) || keys.length === 0) {
      return fail(`${at} metric_keys missing`);
    }
    for (const k of keys) {
      // No action may cite a metric outside a gap-eligible moat — this is the
      // unit-level proof that an unmeasured moat produces zero plan items.
      if (!eligible.has(k)) return fail(`${at} cites ineligible metric_key "${k}"`);
    }

    // Theme cap: count each item toward its primary moat (first metric_key).
    const primaryMoat = metricToMoat[keys[0]];
    if (primaryMoat) perMoat[primaryMoat] = (perMoat[primaryMoat] ?? 0) + 1;

    if (it.effort === "15-min" && day <= quickWinBy) hasEarlyQuickWin = true;
  }

  for (const [moat, count] of Object.entries(perMoat)) {
    if (count > themeCap) {
      return fail(`theme "${moat}" has ${count} items (cap ${themeCap})`);
    }
  }

  if (!hasEarlyQuickWin) {
    return fail(`no 15-min quick win in days 1-${quickWinBy}`);
  }

  // The biggest weighted gap must be acted on early (days 1..topGapBy).
  if (gapOrder.length > 0) {
    const topMoat = gapOrder[0];
    const topEarly = plan.some(
      (it) =>
        it.day_number <= topGapBy &&
        (it.metric_keys ?? []).some((k) => metricToMoat[k] === topMoat),
    );
    if (!topEarly) {
      return fail(`top-gap moat "${topMoat}" not scheduled in days 1-${topGapBy}`);
    }
  }

  return { ok: true, plan };
}

function fail(reason) {
  return { ok: false, reason };
}
