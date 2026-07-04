import type { RawLocalResult } from "./types";

// DEBUG-ONLY instrumentation (SERP_DEBUG=1). The matching DECISION is unchanged
// — it lives verbatim in resolveRank() below; matchTarget only logs around it.
const SERP_DEBUG = process.env.SERP_DEBUG === "1";
function dbg(...args: unknown[]) {
  if (SERP_DEBUG) console.debug("[match]", ...args);
}

// Case/punctuation/diacritic-insensitive normalisation for fuzzy name matching.
// NFKD splits accented letters into base + combining mark; the punctuation
// replace below then drops the marks along with any other non-alphanumerics.
export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Diagnostic-only token overlap (Jaccard on words). NOTE: the live match logic
// does NOT use a numeric score or threshold — it uses substring containment
// (see resolveRank). This is logged purely to show HOW close a candidate is.
function tokenOverlap(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean));
  const B = new Set(b.split(" ").filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  A.forEach((t) => {
    if (B.has(t)) inter++;
  });
  return inter / (A.size + B.size - inter);
}

/**
 * Finds the target business's rank within a point's results.
 * Prefers an exact place_id match; otherwise a fuzzy name match (either name
 * contains the other, once normalised). Returns the rank or null.
 */
export function matchTarget(
  results: RawLocalResult[],
  targetBusinessName: string,
  targetPlaceId?: string | null,
): number | null {
  if (SERP_DEBUG) {
    const target = normalizeName(targetBusinessName);
    dbg("TARGET", {
      place_id: targetPlaceId ?? null,
      name: targetBusinessName,
      normalized: target,
    });
    results.slice(0, 10).forEach((r, i) => {
      const n = normalizeName(r.name);
      const idMatch = !!(targetPlaceId && r.placeId && r.placeId === targetPlaceId);
      const nameEq = n.length > 0 && n === target;
      const candHasTarget = n.length > 0 && target.length > 0 && n.includes(target);
      const targetHasCand = n.length > 0 && target.length > 0 && target.includes(n);
      const nameMatch = nameEq || candHasTarget || targetHasCand;
      dbg(`  cand[${i}] pos=${r.rank}`, {
        placeId: r.placeId,
        name: r.name,
        normalized: n,
        matchedByPlaceId: idMatch,
        matchedByName: nameMatch,
        nameRule: nameEq
          ? "exact"
          : candHasTarget
            ? "candidate⊇target"
            : targetHasCand
              ? "target⊇candidate"
              : "none",
        tokenOverlap: Number(tokenOverlap(n, target).toFixed(2)), // diagnostic only, NOT a threshold
      });
    });
  }

  const rank = resolveRank(results, targetBusinessName, targetPlaceId);
  dbg("RESOLVED rank:", rank);
  return rank;
}

// The ORIGINAL, UNCHANGED match decision — extracted verbatim so instrumentation
// can wrap it without altering behaviour.
function resolveRank(
  results: RawLocalResult[],
  targetBusinessName: string,
  targetPlaceId?: string | null,
): number | null {
  if (targetPlaceId) {
    const byId = results.find((r) => r.placeId && r.placeId === targetPlaceId);
    if (byId) return byId.rank;
    // Fall through to name matching if the place_id isn't in this point's set.
  }

  const target = normalizeName(targetBusinessName);
  if (!target) return null;

  const byName = results.find((r) => {
    const n = normalizeName(r.name);
    return n.length > 0 && (n === target || n.includes(target) || target.includes(n));
  });
  return byName ? byName.rank : null;
}
