import "server-only";

import { AI_ENGINE_MAX_TOKENS } from "@/lib/audit/config";
import type { AiEngine, AiSource } from "./types";

// One adapter for BOTH Perplexity Sonar and ChatGPT — they run through the same
// OpenRouter account/key (their billing rejected our cards; one OpenRouter
// balance covers both). OpenRouter is OpenAI-compatible, so swapping either back
// to a direct vendor key later = change BASE + the bearer key here only.
const BASE = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

type ORMessage = {
  content?: string;
  annotations?: Array<{ url_citation?: { url?: string; title?: string } }>;
};
type ORResp = {
  citations?: unknown[]; // Perplexity Sonar returns cited URLs here
  choices?: Array<{ message?: ORMessage }>;
  error?: { message?: string; code?: number }; // OpenRouter can 200 with an error body
};

export function createOpenRouterEngine(name: string, model: string): AiEngine {
  return {
    name,
    isConfigured: () => !!process.env.OPENROUTER_API_KEY,
    async ask(query) {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY is not set");

      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          // Optional attribution headers OpenRouter recommends.
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://growthos.app",
          "X-Title": "GrowthOS Deep Audit",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: query }],
          max_tokens: AI_ENGINE_MAX_TOKENS,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) throw new Error(`OpenRouter ${name} failed (${res.status})`);

      const data = (await res.json()) as ORResp;
      // OpenRouter sometimes returns HTTP 200 with an { error } body — surface it
      // so the per-query catch logs/retries instead of silently recording empty.
      if (data.error) {
        throw new Error(
          `OpenRouter ${name} error (${data.error.code}): ${data.error.message}`,
        );
      }
      const msg = data.choices?.[0]?.message;
      const text = msg?.content ?? "";
      return { present: !!text, text, sources: extractSources(data, msg) };
    },
  };
}

function extractSources(data: ORResp, msg?: ORMessage): AiSource[] {
  const out: AiSource[] = [];
  // Sonar: top-level `citations` (array of URL strings, occasionally objects).
  for (const c of data.citations ?? []) {
    if (typeof c === "string") out.push({ url: c });
    else if (c && typeof c === "object" && "url" in c) {
      const u = (c as { url?: unknown }).url;
      if (typeof u === "string") out.push({ url: u });
    }
  }
  // OpenAI-style annotations (url_citation).
  for (const a of msg?.annotations ?? []) {
    const u = a?.url_citation?.url;
    if (u) out.push({ url: u, title: a.url_citation?.title });
  }
  const seen = new Set<string>();
  return out.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
