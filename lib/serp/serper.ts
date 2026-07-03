import "server-only";
import type {
  SerpProvider,
  SearchArgs,
  LocalRankResult,
  RawLocalResult,
} from "./types";
import { matchTarget } from "./match";
import { SERP_ZOOM, TOP_RESULTS_LIMIT } from "./config";

// Serper.dev Maps API (primary).
//   POST https://google.serper.dev/maps
//   header: X-API-KEY
//   body:  { q, ll: "@lat,lng,ZOOMz", gl, hl }
//   resp:  { places: [{ position, title, rating, ratingCount, website, placeId }] }
const ENDPOINT = "https://google.serper.dev/maps";

type SerperPlace = {
  position?: number;
  title?: string;
  rating?: number;
  ratingCount?: number;
  website?: string;
  placeId?: string;
};

export function createSerperProvider(): SerpProvider {
  return {
    name: "serper",
    async searchLocalRank(args: SearchArgs): Promise<LocalRankResult> {
      const key = process.env.SERPER_API_KEY;
      if (!key) throw new Error("SERPER_API_KEY is not set");

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({
          q: args.keyword,
          ll: `@${args.lat},${args.lng},${SERP_ZOOM}z`,
          gl: "in",
          hl: "en",
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`Serper request failed (${res.status})`);
      }

      const data = (await res.json()) as { places?: SerperPlace[] };
      const places = Array.isArray(data.places) ? data.places : [];

      const raw: RawLocalResult[] = places.map((p, i) => ({
        name: String(p.title ?? ""),
        rank: Number(p.position ?? i + 1),
        rating: p.rating != null ? Number(p.rating) : null,
        reviews_count: p.ratingCount != null ? Number(p.ratingCount) : null,
        has_website: Boolean(p.website),
        placeId: p.placeId ?? null,
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
