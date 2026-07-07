import "server-only";

import type { AiEngine, AiSource } from "./types";

// google_aio — Google AI Overview presence via Serper's /search. VERIFIED
// EMPIRICALLY: Serper's standard search returns an `aiOverview` field ONLY when
// Google actually renders an AI Overview (absent for most local queries, which
// is a correct negative — confirmed against Kota queries with no AIO). This
// adapter reports presence honestly and never fabricates a citation. If a future
// provider (SerpApi's google_ai_overview endpoint) is needed for fuller AIO
// coverage, it slots in behind this same AiEngine interface.
const ENDPOINT = "https://google.serper.dev/search";

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function createGoogleAioEngine(location: string): AiEngine {
  return {
    name: "google_aio",
    isConfigured: () => !!process.env.SERPER_API_KEY,
    async ask(query) {
      const key = process.env.SERPER_API_KEY;
      if (!key) throw new Error("SERPER_API_KEY is not set");

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "X-API-KEY": key, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "in", hl: "en", location }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Serper search failed (${res.status})`);

      const data = (await res.json()) as Record<string, unknown>;
      const aioRaw = data.aiOverview ?? data.ai_overview;
      if (!aioRaw) return { present: false, text: "", sources: [] };

      if (typeof aioRaw === "string") {
        return { present: true, text: aioRaw, sources: [] };
      }
      const aio = aioRaw as Record<string, unknown>;
      const text = str(aio.snippet) || str(aio.text) || JSON.stringify(aio);
      const rawList = aio.sources ?? aio.references ?? aio.links;
      const list = Array.isArray(rawList) ? (rawList as Record<string, unknown>[]) : [];
      const sources: AiSource[] = list
        .map((s) => ({
          url: str(s.link) || str(s.url) || str(s.source),
          title: str(s.title) || undefined,
        }))
        .filter((s) => !!s.url);

      return { present: true, text, sources };
    },
  };
}
