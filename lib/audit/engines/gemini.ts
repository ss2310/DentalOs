import "server-only";

import { GEMINI_MODEL } from "@/lib/audit/config";
import type { AiEngine, AiSource } from "./types";

// Gemini with Google Search grounding — it IS Google's model citing live web
// results, so it's the closest honest proxy for "what Google's AI surfaces."
// Grounded source URLs come back in candidates[].groundingMetadata.
const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

type GeminiResp = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
};

export const geminiEngine: AiEngine = {
  name: "gemini",
  isConfigured: () => !!process.env.GEMINI_API_KEY,
  async ask(query) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error("GEMINI_API_KEY is not set");

    const res = await fetch(
      `${BASE}/${GEMINI_MODEL}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: query }] }],
          tools: [{ google_search: {} }], // grounding (Gemini 2.x)
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!res.ok) throw new Error(`Gemini failed (${res.status})`);

    const data = (await res.json()) as GeminiResp;
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .map((p) => p.text ?? "")
      .join(" ")
      .trim();
    const sources: AiSource[] = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => c.web)
      .filter((w): w is { uri?: string; title?: string } => !!w)
      .map((w) => ({ url: w.uri ?? "", title: w.title }))
      .filter((s) => !!s.url);

    return { present: !!cand, text, sources };
  },
};
