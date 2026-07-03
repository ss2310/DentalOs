import type {
  SerpProvider,
  SearchArgs,
  LocalRankResult,
  LocalResult,
} from "./types";
import { TOP_RESULTS_LIMIT } from "./config";

// Deterministic, network-free provider. Safe default when SERP_PROVIDER is
// unset: no API key, no cost, stable output for the same inputs — ideal for
// local dev and testing the grid/heatmap/budget without spending metered calls.

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const COMPETITOR_NAMES = [
  "Smile Dental Care",
  "City Dental Clinic",
  "Bright Smiles",
  "Perfect Teeth",
  "Dental Hub",
  "Ortho Plus",
  "Gentle Dentistry",
  "Family Dental",
  "Aesthetic Dental Studio",
  "Root Canal Experts",
];

export function createMockProvider(): SerpProvider {
  return {
    name: "mock",
    async searchLocalRank(args: SearchArgs): Promise<LocalRankResult> {
      const seed = hash(
        `${args.keyword}|${args.lat.toFixed(3)}|${args.lng.toFixed(3)}|${args.targetBusinessName}`,
      );
      // 0 or >20 → "not found" (null); otherwise a rank 1..20.
      const r = seed % 24;
      const rank = r >= 1 && r <= 20 ? r : null;

      // Slot the target into the visible top-10 when its rank falls there.
      const targetSlot = rank != null && rank <= TOP_RESULTS_LIMIT ? rank - 1 : -1;
      const topResults: LocalResult[] = COMPETITOR_NAMES.slice(
        0,
        TOP_RESULTS_LIMIT,
      ).map((name, i) => ({
        name: i === targetSlot ? args.targetBusinessName : name,
        rank: i + 1,
        rating: 3.5 + (hash(name + args.keyword) % 16) / 10, // 3.5–5.0
        reviews_count: 10 + (hash(name) % 500),
        has_website: hash(name) % 3 !== 0,
      }));

      return { rank, topResults };
    },
  };
}
