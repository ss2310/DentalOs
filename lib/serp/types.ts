// The one internal interface every SERP provider implements. Feature code only
// ever depends on this shape — never on a specific provider — so a new adapter
// (e.g. DataForSEO) can be added by registering it in ./index, no UI changes.

export type LocalResult = {
  name: string;
  rank: number;
  rating: number | null;
  reviews_count: number | null;
  has_website: boolean;
};

export type LocalRankResult = {
  // The target business's rank at this coordinate, or null if not in results.
  rank: number | null;
  // The top ~10 local results at this coordinate (used later by prospecting).
  topResults: LocalResult[];
};

export type SearchArgs = {
  keyword: string;
  lat: number;
  lng: number;
  targetBusinessName: string;
  targetPlaceId?: string | null;
};

export interface SerpProvider {
  readonly name: string;
  searchLocalRank(args: SearchArgs): Promise<LocalRankResult>;
}

// Internal richer result (carries placeId for exact matching); never returned
// across the interface — topResults strips it down to LocalResult.
export type RawLocalResult = LocalResult & { placeId: string | null };
