// Shared AI Visibility logic — pure + client-safe (no server-only imports), so
// the server pages/actions AND the client stepper/scorecard can all use it.
// Tables (ai_visibility_queries / ai_visibility_checks) + prospect_audits
// .ai_visibility_summary all ship in migration 007 — no new migration.

import type { AiVisibilitySummary } from "@/lib/types";
import { resolveVerticalSearch } from "@/lib/vertical-search";

// ---- Engines (fixed set; keys match the schema + the public report) ----
export const AI_ENGINES = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "perplexity", label: "Perplexity" },
  { key: "google_ai_overview", label: "Google AI Overview" },
] as const;

export type EngineKey = (typeof AI_ENGINES)[number]["key"];
export const ENGINE_KEYS: EngineKey[] = AI_ENGINES.map((e) => e.key);
export const ENGINE_LABEL: Record<string, string> = Object.fromEntries(
  AI_ENGINES.map((e) => [e.key, e.label]),
);

// ---- Query layers ----
export const QUERY_LAYERS = [
  { key: "direct_brand", label: "Brand" },
  { key: "service_area", label: "Service + Area" },
  { key: "best_of", label: "Best-of lists" },
  { key: "comparison", label: "Comparison" },
  { key: "symptom", label: "Symptom" },
  { key: "voice_style", label: "Voice / near-me" },
] as const;

export type QueryLayer = (typeof QUERY_LAYERS)[number]["key"];
export const LAYER_LABEL: Record<string, string> = Object.fromEntries(
  QUERY_LAYERS.map((l) => [l.key, l.label]),
);

// ---- Row shapes (numeric/jsonb columns as they arrive from Supabase) ----
export type AiQueryRow = {
  id: string;
  query_text: string;
  query_layer: string | null;
  is_active: boolean;
  created_at: string;
};

export type AiCheckRow = {
  id: string;
  query_id: string;
  engine: string;
  checked_at: string;
  is_cited: boolean;
  is_mentioned: boolean;
  position_note: string | null;
  cited_sources: string[] | null;
  raw_excerpt: string | null;
};

// ---- Query set templates, filled with the clinic's data ----
// The query terms come from the per-vertical bank (lib/vertical-search) resolved
// by the clinic's vertical, with the dental fallback. The 6-layer STRUCTURE is
// identical for every vertical — only the terms change. For a dental clinic (or
// an absent vertical) the output is byte-identical to the pre-vertical version.
export function buildQueryTemplates(
  clinic: {
    name?: string | null;
    area?: string | null;
    city?: string | null;
  },
  vertical?: string | null,
): { query_text: string; query_layer: QueryLayer }[] {
  const name = (clinic.name ?? "").trim() || "our clinic";
  const area = (clinic.area ?? "").trim() || (clinic.city ?? "").trim() || "your area";
  const city = (clinic.city ?? "").trim() || (clinic.area ?? "").trim() || "your city";
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();
  const fill = (template: string) =>
    clean(
      template
        .replace(/\{name\}/g, name)
        .replace(/\{area\}/g, area)
        .replace(/\{city\}/g, city),
    );

  const cfg = resolveVerticalSearch(vertical);
  // Brand layer is name-only and shared across verticals; the rest come from the
  // vertical bank in its fixed layer order.
  const out: { query_text: string; query_layer: QueryLayer }[] = [
    { query_text: fill("{name} reviews"), query_layer: "direct_brand" },
    { query_text: fill("is {name} good"), query_layer: "direct_brand" },
  ];
  for (const q of cfg.queries) {
    out.push({ query_text: fill(q.text), query_layer: q.layer });
  }
  return out;
}

// ---- Scoring helpers ----
export function comboKey(queryId: string, engine: string): string {
  return `${queryId}__${engine}`;
}

/** The most recent check per (query, engine) combination. */
export function latestChecks(checks: AiCheckRow[]): Map<string, AiCheckRow> {
  const m = new Map<string, AiCheckRow>();
  for (const c of checks) {
    const k = comboKey(c.query_id, c.engine);
    const prev = m.get(k);
    if (!prev || c.checked_at > prev.checked_at) m.set(k, c);
  }
  return m;
}

export type CellStatus = "cited" | "mentioned" | "absent" | "unchecked";

export function statusOf(check: AiCheckRow | undefined): CellStatus {
  if (!check) return "unchecked";
  if (check.is_cited) return "cited";
  if (check.is_mentioned) return "mentioned";
  return "absent";
}

export type Scorecard = {
  total: number;
  cited: number;
  pct: number;
  perEngine: {
    engine: EngineKey;
    label: string;
    total: number;
    cited: number;
    pct: number;
  }[];
};

/**
 * AI Visibility Score = % of (active query × engine) combinations whose LATEST
 * check is_cited. Unchecked combinations count as not-cited (denominator counts
 * every active query × every engine).
 */
export function computeScorecard(
  activeQueries: AiQueryRow[],
  checks: AiCheckRow[],
): Scorecard {
  const latest = latestChecks(checks);
  const qids = activeQueries.map((q) => q.id);
  let citedTotal = 0;

  const perEngine = AI_ENGINES.map((e) => {
    let cited = 0;
    for (const qid of qids) {
      if (latest.get(comboKey(qid, e.key))?.is_cited) {
        cited++;
        citedTotal++;
      }
    }
    return {
      engine: e.key,
      label: e.label,
      total: qids.length,
      cited,
      pct: qids.length ? Math.round((cited / qids.length) * 100) : 0,
    };
  });

  const total = qids.length * ENGINE_KEYS.length;
  return {
    total,
    cited: citedTotal,
    pct: total ? Math.round((citedTotal / total) * 100) : 0,
    perEngine,
  };
}

/** red <20 · amber 20–60 · green >60 → design tokens. */
export function scoreTone(pct: number): "danger" | "warning" | "success" {
  if (pct < 20) return "danger";
  if (pct <= 60) return "warning";
  return "success";
}

/** Which sites the AI engines are citing, most-cited first — the actionable bit. */
export function aggregateSources(
  checks: AiCheckRow[],
): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of checks) {
    for (const raw of c.cited_sources ?? []) {
      const name = String(raw).trim();
      if (!name) continue;
      m.set(name, (m.get(name) ?? 0) + 1);
    }
  }
  return Array.from(m.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Score per check-date (a "session" ≈ the day's checks). Bucketed, oldest first. */
export function trendByDate(
  checks: AiCheckRow[],
): { date: string; total: number; cited: number; pct: number }[] {
  const byDate = new Map<string, { total: number; cited: number }>();
  for (const c of checks) {
    const d = c.checked_at.slice(0, 10);
    const e = byDate.get(d) ?? { total: 0, cited: 0 };
    e.total++;
    if (c.is_cited) e.cited++;
    byDate.set(d, e);
  }
  return Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      total: v.total,
      cited: v.cited,
      pct: v.total ? Math.round((v.cited / v.total) * 100) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ---- Client-facing export text (#6) ----
export function buildScorecardText(opts: {
  clinicName: string;
  scorecard: Scorecard;
  sources: { name: string; count: number }[];
}): string {
  const { clinicName, scorecard, sources } = opts;
  const lines: string[] = [];
  lines.push(`AI Visibility Scorecard — ${clinicName}`);
  lines.push(
    `Overall: cited in ${scorecard.cited}/${scorecard.total} checks (${scorecard.pct}%)`,
  );
  lines.push("");
  lines.push("By engine:");
  for (const e of scorecard.perEngine) {
    lines.push(`- ${e.label}: ${e.cited}/${e.total} cited (${e.pct}%)`);
  }
  const gaps = scorecard.perEngine
    .filter((e) => e.pct < 50)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 3);
  if (gaps.length) {
    lines.push("");
    lines.push("Biggest gaps:");
    for (const g of gaps) lines.push(`- ${g.label}: only ${g.pct}% cited`);
  }
  if (sources.length) {
    lines.push("");
    lines.push("Where AI is citing others instead:");
    for (const s of sources.slice(0, 5)) lines.push(`- ${s.name} (${s.count})`);
  }
  return lines.join("\n");
}

// ---- Prospect tie-in (#5) — builds the summary the R3 report renders ----
export type ProspectCheckResult = {
  engine: string;
  is_cited: boolean;
  is_mentioned: boolean;
};

/** Plain-English gaps for a prospect audit's AI section (2–3 strings). */
export function buildProspectFindings(results: ProspectCheckResult[]): string[] {
  const perEngine = AI_ENGINES.map((e) => {
    const rs = results.filter((r) => r.engine === e.key);
    return { label: e.label, checked: rs.length, cited: rs.filter((r) => r.is_cited).length };
  }).filter((e) => e.checked > 0);

  const out: string[] = [];
  const invisible = perEngine.filter((e) => e.cited === 0);
  if (invisible.length) {
    const n = invisible[0].checked;
    out.push(
      `Invisible to ${invisible.map((e) => e.label).join(" and ")} — never cited across ${n} test ${n === 1 ? "query" : "queries"}.`,
    );
  }
  const totalChecked = results.length;
  const totalCited = results.filter((r) => r.is_cited).length;
  out.push(`Cited in only ${totalCited} of ${totalChecked} AI answers we checked.`);
  const strong = perEngine.filter((e) => e.cited > 0).sort((a, b) => b.cited - a.cited)[0];
  if (strong) {
    out.push(`Best presence on ${strong.label} (${strong.cited}/${strong.checked}) — weak everywhere else.`);
  }
  return out.slice(0, 3);
}

/**
 * Aggregates a prospect check session into the ai_visibility_summary JSON. Uses
 * the engines:[...] shape the R3 public report already renders (so it lights up
 * unchanged), enriched with checked/cited counts + finding strings.
 */
export function buildProspectSummary(
  results: ProspectCheckResult[],
  checkedAt: string,
): AiVisibilitySummary {
  const engines = AI_ENGINES.map((e) => {
    const rs = results.filter((r) => r.engine === e.key);
    const checked = rs.length;
    const cited = rs.filter((r) => r.is_cited).length;
    const mentioned = rs.filter((r) => r.is_mentioned).length;
    const is_cited = cited > 0;
    return {
      engine: e.key,
      is_cited,
      is_mentioned: !is_cited && mentioned > 0,
      note: `cited ${cited}/${checked}`,
      checked,
      cited,
    };
  }).filter((e) => e.checked > 0);

  return {
    engines,
    checked_at: checkedAt,
    findings: buildProspectFindings(results),
  };
}
