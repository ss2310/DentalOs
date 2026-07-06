import "server-only";

import {
  OPENROUTER_SONAR_MODEL,
  OPENROUTER_CHATGPT_MODEL,
} from "@/lib/audit/config";
import type { AiEngine } from "./types";
import { geminiEngine } from "./gemini";
import { createOpenRouterEngine } from "./openrouter";
import { createGoogleAioEngine } from "./google_aio";

export type { AiEngine, AiEngineResponse, AiSource } from "./types";

// The Stage 4 engine registry. Perplexity + ChatGPT share the OpenRouter key.
// Only CONFIGURED engines run; a missing key skips that engine (logged) instead
// of failing the run. google_aio needs the run's location for local relevance.
export function resolveAiEngines(location: string): {
  active: AiEngine[];
  skipped: string[];
} {
  const all: AiEngine[] = [
    geminiEngine,
    createOpenRouterEngine("perplexity", OPENROUTER_SONAR_MODEL),
    createOpenRouterEngine("chatgpt", OPENROUTER_CHATGPT_MODEL),
    createGoogleAioEngine(location),
  ];
  return {
    active: all.filter((e) => e.isConfigured()),
    skipped: all.filter((e) => !e.isConfigured()).map((e) => e.name),
  };
}

// engine name → the ai_citations boolean metric it rolls up to.
export const ENGINE_METRIC: Record<string, string> = {
  gemini: "gemini_mentioned",
  perplexity: "perplexity_cited",
  chatgpt: "chatgpt_mentioned",
  google_aio: "aio_cited",
};
