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

// DEBUG-ONLY instrumentation (SEC/behaviour unchanged). Turn on by setting
// SERP_DEBUG=1 in the environment; logs the full outgoing Serper request and
// the parsed results at debug level. No effect when the flag is unset.
const SERP_DEBUG = process.env.SERP_DEBUG === "1";
function dbg(...args: unknown[]) {
  if (SERP_DEBUG) console.debug("[serper]", ...args);
}

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

      // The exact body we send. NOTE the params we do NOT send: `location`,
      // `num`, `device`. For the /maps engine the geo origin is carried solely
      // by `ll` (@lat,lng,zoom); each grid node passes its own lat/lng here.
      const body = {
        q: args.keyword,
        ll: `@${args.lat},${args.lng},${SERP_ZOOM}z`,
        gl: "in",
        hl: "en",
      };
      dbg("REQUEST", {
        endpoint: ENDPOINT, //           https://google.serper.dev/maps  (Maps engine)
        method: "POST",
        params: body, //                 q, ll, gl, hl  (no location/num/device)
        node: { lat: args.lat, lng: args.lng },
      });

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        // SEC-M2: bound the call so a hung provider can't stall the scan (and
        // run up billed duration). 49 cells × a hang would otherwise pile up.
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        throw new Error(`Serper request failed (${res.status})`);
      }

      const data = (await res.json()) as {
        places?: SerperPlace[];
        organic?: unknown[];
      };
      const places = Array.isArray(data.places) ? data.places : [];
      dbg("RESPONSE parsed 'places' (map pack) — NOT 'organic'.", {
        placesCount: places.length,
        organicPresent: Array.isArray(data.organic),
        top5: places.slice(0, 5).map((p) => ({
          position: p.position,
          name: p.title,
        })),
      });

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
