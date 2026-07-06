import "server-only";

import { PAGESPEED_TIMEOUT_MS } from "@/lib/audit/config";

// PageSpeed Insights API (mobile) — server-only. Returns the performance score,
// a Core Web Vitals Pass/Fail, and the final URL scheme (for https_ssl). Callers
// must treat a thrown error as "one entity failed" and record null signals —
// never let a slow competitor site crash the run.

const PSI_BASE =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

export type PageSpeedResult = {
  // 0–100 Lighthouse performance score (mobile), or null if unavailable.
  performance: number | null;
  // Field/lab CWV verdict, or null if not enough data.
  coreWebVitals: "Pass" | "Fail" | null;
  // Final URL after redirects + whether it resolved over https.
  finalUrl: string | null;
  isHttps: boolean;
};

export async function runPageSpeedMobile(
  url: string,
): Promise<PageSpeedResult> {
  const key = process.env.PAGESPEED_API_KEY;
  const params = new URLSearchParams({
    url,
    strategy: "mobile",
    category: "performance",
  });
  if (key) params.set("key", key);

  const res = await fetch(`${PSI_BASE}?${params.toString()}`, {
    signal: AbortSignal.timeout(PAGESPEED_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`PageSpeed failed (${res.status})`);
  }
  const data = (await res.json()) as PsiResponse;

  const perfRaw =
    data.lighthouseResult?.categories?.performance?.score ?? null;
  const performance = perfRaw == null ? null : Math.round(perfRaw * 100);

  const finalUrl =
    data.lighthouseResult?.finalUrl ?? data.id ?? url ?? null;
  const isHttps = (finalUrl ?? "").toLowerCase().startsWith("https://");

  return {
    performance,
    coreWebVitals: deriveCwv(data),
    finalUrl,
    isHttps,
  };
}

// Prefer the loadingExperience field-data verdict (real users); fall back to a
// lab check on LCP + CLS from the Lighthouse audits when field data is absent.
function deriveCwv(data: PsiResponse): "Pass" | "Fail" | null {
  const overall = data.loadingExperience?.overall_category;
  if (overall === "FAST" || overall === "AVERAGE") return "Pass";
  if (overall === "SLOW") return "Fail";

  const audits = data.lighthouseResult?.audits;
  const lcp = audits?.["largest-contentful-paint"]?.numericValue;
  const cls = audits?.["cumulative-layout-shift"]?.numericValue;
  if (lcp == null && cls == null) return null;
  const lcpOk = lcp == null || lcp <= 2500; // ms
  const clsOk = cls == null || cls <= 0.1;
  return lcpOk && clsOk ? "Pass" : "Fail";
}

type PsiResponse = {
  id?: string;
  loadingExperience?: { overall_category?: "FAST" | "AVERAGE" | "SLOW" };
  lighthouseResult?: {
    finalUrl?: string;
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, { numericValue?: number }>;
  };
};
