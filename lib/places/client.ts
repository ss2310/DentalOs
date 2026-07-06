import "server-only";

// Google Places API (New) client — Text Search + Place Details, server-only.
// FIELD MASKS ARE MANDATORY on the New API and they DRIVE BILLING (you pay for
// the most expensive SKU any requested field belongs to), so every mask here is
// explicit and minimal. Never expose GOOGLE_MAPS_API_KEY to the client.

const PLACES_BASE = "https://places.googleapis.com/v1";

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not set");
  return key;
}

// ---- Text Search (resolve a name near a point → place_id) -------------------
// Mask kept to the ID-only SKU + minimal identity fields for matching.
const TEXT_SEARCH_MASK =
  "places.id,places.displayName,places.formattedAddress,places.location";

export type PlaceCandidate = {
  placeId: string;
  name: string;
  address: string | null;
};

export async function placesTextSearch(
  query: string,
  opts: { lat: number; lng: number; radiusM?: number; maxResults?: number },
): Promise<PlaceCandidate[]> {
  const res = await fetch(`${PLACES_BASE}/places:searchText`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": TEXT_SEARCH_MASK,
    },
    body: JSON.stringify({
      textQuery: query,
      regionCode: "IN",
      maxResultCount: opts.maxResults ?? 5,
      locationBias: {
        circle: {
          center: { latitude: opts.lat, longitude: opts.lng },
          radius: opts.radiusM ?? 5000,
        },
      },
    }),
    // Places is fast; don't let a hang stall the whole stage.
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Places Text Search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    places?: Array<{
      id: string;
      displayName?: { text?: string };
      formattedAddress?: string;
    }>;
  };
  return (data.places ?? []).map((p) => ({
    placeId: p.id,
    name: p.displayName?.text ?? "",
    address: p.formattedAddress ?? null,
  }));
}

// ---- Place Details (the GBP metrics for one place) --------------------------
// Every field maps to a places-source metric in metric_definitions. Listed
// explicitly so the billing SKU is visible and stable.
export const PLACE_DETAILS_MASK = [
  "id",
  "displayName",
  "rating", // avg_google_rating
  "userRatingCount", // total_google_reviews
  "photos", // photo_count (capped by the API — best-effort)
  "primaryTypeDisplayName", // primary_gbp_category
  "types", // secondary_categories / category_count
  "regularOpeningHours", // business_hours_complete
  "websiteUri", // entity website (feeds Stage 3)
  "googleMapsUri", // gbp_url
  "nationalPhoneNumber",
  "reviews", // review_reply_pct (best-effort; often absent)
].join(",");

export type PlaceDetails = {
  id: string;
  displayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  photos?: Array<{ name: string }>;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  regularOpeningHours?: { periods?: unknown[]; weekdayDescriptions?: string[] };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  reviews?: Array<{ text?: { text?: string } }>;
};

export async function placeDetails(placeId: string): Promise<PlaceDetails> {
  const res = await fetch(
    `${PLACES_BASE}/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey(),
        "X-Goog-FieldMask": PLACE_DETAILS_MASK,
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!res.ok) {
    throw new Error(`Places Details failed (${res.status})`);
  }
  return (await res.json()) as PlaceDetails;
}
