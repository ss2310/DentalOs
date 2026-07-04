import "server-only";
import type {
  SerpProvider,
  SearchArgs,
  LocalRankResult,
  RawLocalResult,
} from "./types";
import { matchTarget } from "./match";
import { SERP_ZOOM, TOP_RESULTS_LIMIT } from "./config";

// SerpApi google_maps engine (backup).
//   GET https://serpapi.com/search?engine=google_maps&type=search
//       &q=<kw>&ll=@lat,lng,ZOOMz&gl=in&hl=en&api_key=...
//   resp: { local_results: [{ position, title, rating, reviews, website, place_id }] }
const ENDPOINT = "https://serpapi.com/search";

type SerpApiResult = {
  position?: number;
  title?: string;
  rating?: number;
  reviews?: number;
  website?: string;
  place_id?: string;
};

export function createSerpApiProvider(): SerpProvider {
  return {
    name: "serpapi",
    async searchLocalRank(args: SearchArgs): Promise<LocalRankResult> {
      const key = process.env.SERPAPI_API_KEY;
      if (!key) throw new Error("SERPAPI_API_KEY is not set");

      const url = new URL(ENDPOINT);
      url.searchParams.set("engine", "google_maps");
      url.searchParams.set("type", "search");
      url.searchParams.set("q", args.keyword);
      url.searchParams.set("ll", `@${args.lat},${args.lng},${SERP_ZOOM}z`);
      url.searchParams.set("gl", "in");
      url.searchParams.set("hl", "en");
      url.searchParams.set("api_key", key);

      // SEC-M2: bound the call so a hung provider can't stall the scan.
      const res = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`SerpApi request failed (${res.status})`);
      }

      const data = (await res.json()) as { local_results?: SerpApiResult[] };
      const results = Array.isArray(data.local_results) ? data.local_results : [];

      const raw: RawLocalResult[] = results.map((p, i) => ({
        name: String(p.title ?? ""),
        rank: Number(p.position ?? i + 1),
        rating: p.rating != null ? Number(p.rating) : null,
        reviews_count: p.reviews != null ? Number(p.reviews) : null,
        has_website: Boolean(p.website),
        placeId: p.place_id ?? null,
      }));

      const rank = matchTarget(raw, args.targetBusinessName, args.targetPlaceId);
      const topResults = raw.slice(0, TOP_RESULTS_LIMIT).map((r) => ({
        name: r.name,
        rank: r.rank,
        rating: r.rating,
        reviews_count: r.reviews_count,
        has_website: r.has_website,
      }));
      return { rank, topResults };
    },
  };
}
