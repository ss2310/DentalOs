import "server-only";

import {
  WEBSITE_BYTE_CAP,
  WEBSITE_FETCH_TIMEOUT_MS,
} from "@/lib/audit/config";
import type { WebsiteSnapshot } from "@/lib/audit/types";

// Fetches a site's homepage + one obvious service page, strips scripts/styles/
// markup, and byte-caps the result into a compact text snapshot for the Claude
// classifier. Never throws — a fetch failure returns a snapshot with fetchError
// set so the stage can record null website_llm signals and move on.

const SERVICE_LINK_RE =
  /(service|treatment|procedure|pricing|price|cost|about)/i;

function normalizeUrl(raw: string): string {
  const u = raw.trim();
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchCapped(
  url: string,
): Promise<{ html: string; finalUrl: string }> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      // A plain UA — some sites 403 an empty one.
      "User-Agent": "GrowthOS-Audit/1.0 (+https://growthos.app)",
    },
    signal: AbortSignal.timeout(WEBSITE_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  return { html: raw.slice(0, WEBSITE_BYTE_CAP), finalUrl: res.url || url };
}

function findServicePage(html: string, base: string): string | null {
  // Scan hrefs for the first plausible service/pricing/about link.
  const hrefs = Array.from(
    html.matchAll(/href\s*=\s*["']([^"']+)["']/gi),
    (m) => m[1],
  );
  for (const href of hrefs) {
    if (!SERVICE_LINK_RE.test(href)) continue;
    if (/^(mailto:|tel:|#|javascript:)/i.test(href)) continue;
    try {
      const resolved = new URL(href, base).toString();
      // Same-host only — don't wander off to social/booking domains.
      if (new URL(resolved).host === new URL(base).host) return resolved;
    } catch {
      // ignore malformed href
    }
  }
  return null;
}

export async function fetchSiteSnapshot(
  websiteUrl: string,
): Promise<WebsiteSnapshot> {
  try {
    const home = await fetchCapped(normalizeUrl(websiteUrl));
    const isHttps = home.finalUrl.toLowerCase().startsWith("https://");
    let text = `HOMEPAGE (${home.finalUrl}):\n${stripHtml(home.html)}`;

    const servicePage = findServicePage(home.html, home.finalUrl);
    if (servicePage) {
      try {
        const svc = await fetchCapped(servicePage);
        text += `\n\nSERVICE PAGE (${svc.finalUrl}):\n${stripHtml(svc.html)}`;
      } catch {
        // A missing service page is fine — homepage alone is enough to classify.
      }
    }

    // Final guard so two capped pages can't exceed the budget after joining.
    if (text.length > WEBSITE_BYTE_CAP) text = text.slice(0, WEBSITE_BYTE_CAP);

    return { finalUrl: home.finalUrl, isHttps, text, fetchError: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "fetch failed";
    return { finalUrl: null, isHttps: false, text: "", fetchError: msg };
  }
}
