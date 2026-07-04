// Per-vertical search / audit vocabulary — the ONE place the AI-visibility query
// bank, the grid-scan (map-scan) primary keyword, and the competitor-discovery
// keyword vary by vertical. Pure + client-safe (no server-only imports) so both
// server actions AND client components can import it.
//
// Resolution mirrors the vertical fallback rule: use the clinic's vertical, else
// fall back to the default (dental) — the code-level analogue of the NULL/dental
// fallback. Dental values are BYTE-IDENTICAL to what buildQueryTemplates and the
// rank UI hardcoded before, so dental behaviour is unchanged. Onboarding a niche
// = add ONE entry here (data, not a code branch) — same spirit as the seed-data
// vertical rule in CLAUDE.md. The 6-layer query STRUCTURE is fixed; only the
// terms change per vertical.

import { DEFAULT_VERTICAL } from "@/lib/vertical";

// The five non-brand AI-visibility query layers. The brand layer ("{name}
// reviews", "is {name} good") is name-only and identical across verticals, so it
// lives in buildQueryTemplates, not here.
export type SearchQueryLayer =
  | "service_area"
  | "best_of"
  | "comparison"
  | "symptom"
  | "voice_style";

export type VerticalSearchConfig = {
  // Grid-scan / map-scan primary keyword default (still overridable per clinic).
  gridKeyword: string;
  // Keyword that drives competitor discovery (the SERP search term). Same as the
  // grid keyword by default — competitors are whoever ranks for it.
  competitorKeyword: string;
  // Example query, used as the "add a query" input placeholder.
  sampleQuery: string;
  // The 10 non-brand AI-visibility query templates. {name}/{area}/{city} are
  // substituted with the clinic's data. Identical layer distribution for every
  // vertical (3 service_area · 2 best_of · 1 comparison · 2 symptom · 2
  // voice_style) — structure identical, only the terms change.
  queries: { text: string; layer: SearchQueryLayer }[];
};

export const VERTICAL_SEARCH: Record<string, VerticalSearchConfig> = {
  // Dental — the exact strings buildQueryTemplates / rank used before.
  dental: {
    gridKeyword: "dentist near me",
    competitorKeyword: "dentist near me",
    sampleQuery: "best dentist for kids in Andheri",
    queries: [
      { text: "best dentist in {area} {city}", layer: "service_area" },
      { text: "RCT cost in {city}", layer: "service_area" },
      { text: "dental implant cost in {city}", layer: "service_area" },
      { text: "top dental clinics in {city}", layer: "best_of" },
      { text: "best dental clinic in {area}", layer: "best_of" },
      { text: "{name} vs other dentists in {area}", layer: "comparison" },
      { text: "tooth pain which doctor should I see in {city}", layer: "symptom" },
      { text: "bleeding gums treatment in {city}", layer: "symptom" },
      { text: "dentist near me open now in {area}", layer: "voice_style" },
      { text: "emergency dentist near me in {area}", layer: "voice_style" },
    ],
  },
  derma: {
    gridKeyword: "dermatologist near me",
    competitorKeyword: "dermatologist near me",
    sampleQuery: "best dermatologist for acne in Andheri",
    queries: [
      { text: "best dermatologist in {area} {city}", layer: "service_area" },
      { text: "acne treatment cost in {city}", layer: "service_area" },
      { text: "pigmentation treatment cost in {city}", layer: "service_area" },
      { text: "top skin clinics in {city}", layer: "best_of" },
      { text: "best skin clinic in {area}", layer: "best_of" },
      { text: "{name} vs other dermatologists in {area}", layer: "comparison" },
      { text: "acne which doctor should I see in {city}", layer: "symptom" },
      { text: "skin allergy treatment in {city}", layer: "symptom" },
      { text: "skin specialist near me in {area}", layer: "voice_style" },
      { text: "dermatologist near me open now in {area}", layer: "voice_style" },
    ],
  },
  ortho: {
    gridKeyword: "orthopedic doctor near me",
    competitorKeyword: "orthopedic doctor near me",
    sampleQuery: "best knee replacement surgeon in Andheri",
    queries: [
      { text: "best orthopedic doctor in {area} {city}", layer: "service_area" },
      { text: "knee replacement cost in {city}", layer: "service_area" },
      { text: "back pain treatment cost in {city}", layer: "service_area" },
      { text: "top orthopedic clinics in {city}", layer: "best_of" },
      { text: "best orthopedic clinic in {area}", layer: "best_of" },
      { text: "{name} vs other orthopedic doctors in {area}", layer: "comparison" },
      { text: "knee pain which doctor should I see in {city}", layer: "symptom" },
      { text: "back pain specialist in {city}", layer: "symptom" },
      { text: "orthopedic doctor near me open now in {area}", layer: "voice_style" },
      { text: "orthopedic surgeon near me in {area}", layer: "voice_style" },
    ],
  },
  physio: {
    gridKeyword: "physiotherapist near me",
    competitorKeyword: "physiotherapist near me",
    sampleQuery: "best physiotherapist for back pain in Andheri",
    queries: [
      { text: "best physiotherapist in {area} {city}", layer: "service_area" },
      { text: "sports injury rehab cost in {city}", layer: "service_area" },
      { text: "physiotherapy session cost in {city}", layer: "service_area" },
      { text: "top physiotherapy clinics in {city}", layer: "best_of" },
      { text: "best physiotherapy clinic in {area}", layer: "best_of" },
      { text: "{name} vs other physiotherapists in {area}", layer: "comparison" },
      { text: "back pain physiotherapy in {city}", layer: "symptom" },
      { text: "sports injury rehab in {city}", layer: "symptom" },
      { text: "physiotherapist near me open now in {area}", layer: "voice_style" },
      { text: "physiotherapy near me in {area}", layer: "voice_style" },
    ],
  },
};

/**
 * Resolve the search config for a clinic's vertical, falling back to the default
 * (dental) for an unknown/absent vertical — the code-level NULL/dental fallback.
 * Never throws.
 */
export function resolveVerticalSearch(
  vertical?: string | null,
): VerticalSearchConfig {
  return VERTICAL_SEARCH[vertical ?? ""] ?? VERTICAL_SEARCH[DEFAULT_VERTICAL];
}
