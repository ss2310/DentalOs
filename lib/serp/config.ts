// Shared constants for the SERP provider layer. Kept in its own module so the
// adapters and the registry can import them without a circular dependency.

// Google Maps zoom level baked into the `ll` coordinate (@lat,lng,ZOOMz).
// ~14z is neighbourhood-level — the right scale for a local grid scan.
export const SERP_ZOOM = 14;

// How many local results we keep per point (used later by prospecting).
export const TOP_RESULTS_LIMIT = 10;

// Rank assigned to a "not found" point when averaging (per spec).
export const NOT_FOUND_RANK = 21;
