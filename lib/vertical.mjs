// Shared multi-vertical resolution — the ONE place the "which rows apply to this
// clinic's vertical" rule lives. Pure + dependency-free so it runs under Node's
// test runner (scripts/test-vertical-parity.mjs) and is imported by both the API
// route and the page loaders. Types: lib/vertical.d.ts.

// The default (and, today, only active) vertical. Existing clinics carry this via
// the clinics.vertical column DEFAULT.
export const DEFAULT_VERTICAL = "dental";

/**
 * Resolve vertical-scoped catalog rows for a clinic.
 *
 * Each row carries a `vertical`: a slug it's scoped to, or null/undefined = it
 * applies to ALL verticals (the shared default). Given the clinic's vertical:
 *   - PREFER a row scoped to the clinic's vertical,
 *   - ELSE fall back to the shared (null) row for the same logical key,
 *   - NEVER return a row belonging to a different vertical.
 * Input order is preserved (first-seen key order).
 *
 * `keyOf` names the logical slot two rows would compete for (e.g. a post type's
 * name, or a topic's bank+label). When a vertical-specific row and a shared row
 * share a key, the specific one wins.
 *
 * For a dental clinic today — where every catalog row's vertical is null — this
 * returns every row unchanged, in the original order: identical to pre-migration.
 */
export function resolveForVertical(rows, clinicVertical, keyOf) {
  const chosen = new Map();
  const order = [];
  for (const row of rows ?? []) {
    const v = row.vertical ?? null;
    // Never cross into another vertical.
    if (v !== null && v !== clinicVertical) continue;
    const key = keyOf(row);
    const existing = chosen.get(key);
    if (existing === undefined) {
      chosen.set(key, row);
      order.push(key);
    } else if ((existing.vertical ?? null) === null && v === clinicVertical) {
      // A vertical-specific row beats the shared (null) one for the same slot.
      chosen.set(key, row);
    }
    // else: keep what we have (already specific, or a duplicate shared row).
  }
  return order.map((k) => chosen.get(k));
}

/**
 * The one templated line the shared system prompt gains. Returns EMPTY for the
 * default vertical (dental) so today's dental prompt is byte-for-byte unchanged;
 * any other vertical appends "\nYou write for a <DisplayName> clinic." The
 * caller substitutes this into the {{vertical_directive}} placeholder.
 */
export function verticalDirective(clinicVertical, displayName) {
  if (clinicVertical === DEFAULT_VERTICAL) return "";
  return `\nYou write for a ${displayName} clinic.`;
}
