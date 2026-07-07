// Deterministic YMYL validator for social content — the programmatic gate that
// runs BETWEEN generation and storage (the prompt-side rails in
// app/api/generate/route.ts are guidance; THIS is enforcement). Pure +
// dependency-free so it runs under `node --test` (scripts/test-social-ymyl.mjs).
//
// Checks, in order:
//   1. Banned phrases — the shared floor below + vertical compliance_rules +
//      the clinic's own voice-profile banned_phrases.
//   2. Guarantee/superlative patterns (outcome promises YMYL forbids).
//   3. POISONED STATS — any percentage, money amount, or "studies show"-style
//      claim in the output must trace back to an allowed fact (supplied inputs
//      or a VERIFIED proof point), else it's a fabrication and is blocked.
//   4. Required disclaimers — reported as missing so the caller can append
//      them (absence is fixable, not a block).

// The floor that applies even with an empty DB (mirrors the seeded shared
// compliance_rules). Vertical/profile lists are passed in on top.
export const GLOBAL_BANNED_PHRASES = [
  "100% painless",
  "completely painless",
  "guaranteed result",
  "guaranteed results",
  "best in city",
  "best in town",
  "no. 1 clinic",
  "number one clinic",
  "no side effects",
  "permanent solution",
  "miracle",
  "instant cure",
  "lifetime warranty",
];

// Outcome-promise shapes a phrase list can't fully cover.
const GUARANTEE_PATTERNS = [
  /\bguarantee[sd]?\b/i,
  /\b100\s*%\s*(safe|painless|effective|success)/i,
  /\bassured\s+results?\b/i,
  /\bwill\s+(completely\s+)?cure\b/i,
  /\bzero\s+(pain|risk|side\s*effects?)\b/i,
];

// Numeric/citation claims that must be grounded in an allowed fact.
const PERCENT_RE = /\d+(?:\.\d+)?\s*%/g;
const MONEY_RE = /(?:₹|\bRs\.?\s?|\bINR\s?)\s*[\d,]+/gi;
const CITATION_RE =
  /\b(studies\s+show|research\s+(shows|proves)|clinically\s+proven|scientifically\s+proven|according\s+to\s+(a\s+)?stud(y|ies))\b/gi;

/** Digits-only form for loose matching ("₹ 4,999" ⊂ "price is ₹4999"). */
function digitsOf(s) {
  return String(s).replace(/\D/g, "");
}

/**
 * Is a numeric claim token grounded in the allowed facts? True when any
 * allowed-fact string contains the same digit run (so "95%" passes if a
 * verified proof point or the user's own context supplied "95").
 */
function isGrounded(token, allowedFacts) {
  const d = digitsOf(token);
  if (!d) return false;
  return allowedFacts.some((f) => digitsOf(f).includes(d));
}

/**
 * Validate one piece of generated text.
 *
 * @param text            the generated caption / slide copy
 * @param opts.bannedPhrases        vertical + profile phrases (floor is built in)
 * @param opts.requiredDisclaimers  disclaimers that must appear in the text
 * @param opts.allowedFacts         strings the numbers MAY come from: topic,
 *                                  context, extras, clinic phone, and the
 *                                  claims of VERIFIED proof points only
 * @returns { ok, violations: [{kind, detail}], missingDisclaimers: [] }
 *          ok is false only for blocking violations; missing disclaimers are
 *          fixable by appending and do NOT set ok=false on their own.
 */
export function validateYmyl(text, opts = {}) {
  const banned = [
    ...GLOBAL_BANNED_PHRASES,
    ...(opts.bannedPhrases ?? []),
  ];
  const allowedFacts = (opts.allowedFacts ?? []).map((f) => String(f ?? ""));
  const violations = [];
  const lower = String(text ?? "").toLowerCase();

  // 1. banned phrases (case-insensitive substring)
  for (const phrase of banned) {
    const p = String(phrase ?? "").trim().toLowerCase();
    if (p && lower.includes(p)) {
      violations.push({ kind: "banned_phrase", detail: phrase });
    }
  }

  // 2. guarantee / outcome-promise patterns
  for (const re of GUARANTEE_PATTERNS) {
    const m = String(text).match(re);
    if (m) violations.push({ kind: "guarantee", detail: m[0] });
  }

  // 3. poisoned stats — ungrounded %, money, or study citations
  for (const m of String(text).matchAll(PERCENT_RE)) {
    if (!isGrounded(m[0], allowedFacts)) {
      violations.push({ kind: "unverified_stat", detail: m[0] });
    }
  }
  for (const m of String(text).matchAll(MONEY_RE)) {
    if (!isGrounded(m[0], allowedFacts)) {
      violations.push({ kind: "unverified_price", detail: m[0].trim() });
    }
  }
  for (const m of String(text).matchAll(CITATION_RE)) {
    // A citation phrase is only OK if some allowed fact itself carries a
    // source-ish claim (i.e. a verified proof point mentioned it).
    const grounded = allowedFacts.some((f) =>
      f.toLowerCase().includes(m[0].toLowerCase()),
    );
    if (!grounded) {
      violations.push({ kind: "unverified_citation", detail: m[0] });
    }
  }

  // 4. required disclaimers — missing = fixable, not blocking
  const missingDisclaimers = (opts.requiredDisclaimers ?? []).filter(
    (d) => d && !lower.includes(String(d).toLowerCase()),
  );

  return { ok: violations.length === 0, violations, missingDisclaimers };
}

/** Append any missing disclaimers on their own lines (idempotent). */
export function appendDisclaimers(text, missingDisclaimers) {
  if (!missingDisclaimers || missingDisclaimers.length === 0) return text;
  return `${String(text).trimEnd()}\n\n${missingDisclaimers.join("\n")}`;
}

// GBP public-content rules encoded as SOFT warnings (publishing is manual, so
// these inform the approver — they never block). Length limit: 1,500 chars.
export const GBP_MAX_CHARS = 1500;

export function gbpSoftWarnings(text) {
  const warnings = [];
  const s = String(text ?? "");
  if (s.length > GBP_MAX_CHARS) {
    warnings.push(
      `Google Business posts are capped at ${GBP_MAX_CHARS} characters — this is ${s.length}. Google will truncate it.`,
    );
  }
  if (/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/.test(s)) {
    warnings.push(
      "Google may reject posts containing phone numbers — prefer the profile's call button.",
    );
  }
  const words = s.split(/\s+/).filter((w) => /^[A-Z]{4,}$/.test(w));
  if (words.length >= 2) {
    warnings.push(
      "Multiple ALL-CAPS words — Google flags posts that look like shouting/spam.",
    );
  }
  const emojiCount = (s.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojiCount > 4) {
    warnings.push(
      `Heavy emoji use (${emojiCount}) — Google may flag the post as low quality.`,
    );
  }
  if (/(bit\.ly|tinyurl\.com|goo\.gl|t\.co)\//i.test(s)) {
    warnings.push("Shortened URLs are often rejected by Google — use the full link.");
  }
  return warnings;
}

/** One human line per violation, for the regenerate prompt + the UI. */
export function describeViolations(violations) {
  const label = {
    banned_phrase: "banned phrase",
    guarantee: "outcome guarantee",
    unverified_stat: "statistic not supplied in the inputs",
    unverified_price: "price not supplied in the inputs",
    unverified_citation: "study/citation claim without a verified source",
  };
  return (violations ?? []).map(
    (v) => `${label[v.kind] ?? v.kind}: "${v.detail}"`,
  );
}
