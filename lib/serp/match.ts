import type { RawLocalResult } from "./types";

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
