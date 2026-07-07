import "server-only";
import type { SerpProvider } from "./types";
import { createSerperProvider } from "./serper";
import { createSerpApiProvider } from "./serpapi";
import { createMockProvider } from "./mock";

export type { SerpProvider, LocalResult, LocalRankResult } from "./types";
export { generateGrid, MAX_GRID_SIZE } from "./grid";
export type { GridPoint } from "./grid";
export { NOT_FOUND_RANK } from "./config";
export { buildCompetitorSummary } from "./competitors";
export type { ScanCellInput } from "./competitors";

// Provider registry. Add a fourth provider (e.g. DataForSEO) by dropping in its
// adapter file and adding ONE line here — no feature code changes, because the
// rest of the app only ever calls getSerpProvider().
const REGISTRY: Record<string, () => SerpProvider> = {
  serper: createSerperProvider, // primary
  serpapi: createSerpApiProvider, // backup
  mock: createMockProvider, // default (no cost)
  // dataforseo: createDataForSeoProvider,  // future — just register here
};

// Safe default when SERP_PROVIDER is unset: the free, network-free mock.
export const DEFAULT_PROVIDER = "mock";

export function getSerpProvider(): SerpProvider {
  const factory = REGISTRY[activeProviderName()] ?? REGISTRY[DEFAULT_PROVIDER];
  return factory();
}

// The resolved provider name (falls back to the default for unset/unknown).
export function activeProviderName(): string {
  const name = (process.env.SERP_PROVIDER ?? DEFAULT_PROVIDER).trim().toLowerCase();
  return REGISTRY[name] ? name : DEFAULT_PROVIDER;
}

// True when the active provider returns REAL Google data (i.e. not the mock).
export function isLiveProvider(): boolean {
  return activeProviderName() !== "mock";
}
