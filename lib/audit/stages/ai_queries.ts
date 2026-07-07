import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveAiEngines, ENGINE_METRIC } from "@/lib/audit/engines";
import { generateQueries } from "@/lib/audit/queries";
import { parseCitations } from "@/lib/audit/parse-citations";
import { matchSelf } from "@/lib/audit/self-match.mjs";
import {
  AI_ENGINE_DELAY_MS,
  COST_INR,
  DENTAL_TREATMENTS_DEFAULT,
} from "@/lib/audit/config";
import type {
  StageContext,
  StageResult,
  AuditEntity,
  EngineAnswer,
  AiQueryResultInsert,
  SignalInsert,
} from "@/lib/audit/types";

// STAGE 4 — AI VISIBILITY. Runs the 12-query L1–L6 framework across every
// configured engine (sequential, polite delay), parses each engine's batch with
// one Claude call, writes per-(query×engine) rows to ai_query_results, and rolls
// up to audit_signals (per-engine cited booleans, citation rate, best layer,
// per-entity mention counts, + source-intelligence in raw_meta). Idempotent:
// clears this run's ai_query_results + ai_citations signals first.

const ENGINE_COST: Record<string, number> = {
  gemini: COST_INR.gemini,
  perplexity: COST_INR.openrouterSonar,
  chatgpt: COST_INR.openrouterChatgpt,
  google_aio: COST_INR.serperSearch,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Retry on a rate-limit (429) or a transient failure (503 / timeout) with
// exponential backoff — 2 retries (3 attempts: 0s, 2s, 4s) before giving up.
// Gemini's free tier throttles a 6-query burst (429) and its grounded endpoint
// intermittently 503s/times out. After the last retry the error propagates to the
// per-query catch, which records the cell as status='error' (NOT a measured
// negative) so a transient failure is never scored as "the engine didn't cite us".
async function askWithRetry(
  engine: { ask: (q: string) => Promise<import("@/lib/audit/engines").AiEngineResponse> },
  text: string,
) {
  const backoffs = [2000, 4000]; // 2 retries, exponential
  for (let attempt = 0; ; attempt++) {
    try {
      return await engine.ask(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const transient =
        /\b429\b|\b503\b|rate limit|resource_exhausted|overloaded|unavailable|timed?\s*out|timeout|etimedout|econnreset/i.test(
          msg,
        );
      if (transient && attempt < backoffs.length) {
        await sleep(backoffs[attempt]);
        continue;
      }
      throw err;
    }
  }
}

export async function stageAiQueries(ctx: StageContext): Promise<StageResult> {
  const { admin, run } = ctx;
  let cost = 0;

  // --- entities: self + competitors ---
  const { data: entsData } = await admin
    .from("audit_entities")
    .select("id, entity_kind, display_name, place_id, website_url")
    .eq("run_id", run.id);
  const ents = (entsData ?? []) as AuditEntity[];
  const self = ents.find((e) => e.entity_kind === "self");
  if (!self) throw new Error("No self entity (run Stage 1).");
  const competitors = ents.filter((e) => e.entity_kind === "competitor");
  const competitorNames = competitors
    .map((c) => c.display_name ?? "")
    .filter(Boolean);

  // --- clinic locale + treatments (rate_cards menu, high-value first) ---
  const { data: clinic } = await admin
    .from("clinics")
    .select("business_name, city, area")
    .eq("id", run.clinic_id)
    .single();
  const treatments = await loadTreatments(admin, run.clinic_id);

  // The clinic's full name as stored — used verbatim by the deterministic
  // self-matcher (no stripping, so a bare "Mahima" can't false-positive).
  const selfName = (self.display_name ?? clinic?.business_name ?? "").trim();
  const selfWebsite = self.website_url ?? null;
  const queries = generateQueries({
    city: clinic?.city ?? "",
    area: clinic?.area ?? clinic?.city ?? "",
    clinicName: self.display_name ?? clinic?.business_name ?? "",
    treatments,
  });
  const location = [clinic?.area, clinic?.city, "India"].filter(Boolean).join(", ");

  const { active, skipped } = resolveAiEngines(location);
  if (skipped.length) {
    console.info("[ai_queries] engines skipped (no key):", skipped.join(", "));
  }
  if (active.length === 0) {
    throw new Error(
      "No AI engines configured — set GEMINI_API_KEY / OPENROUTER_API_KEY / SERPER_API_KEY.",
    );
  }

  // --- idempotent: clear this run's Stage-4 output ---
  await admin.from("ai_query_results").delete().eq("run_id", run.id);
  await admin
    .from("audit_signals")
    .delete()
    .eq("run_id", run.id)
    .eq("source", "ai_citations");

  const rows: AiQueryResultInsert[] = [];
  const engineSelfCited: Record<string, boolean | null> = {};
  const mentionCount: Record<string, number> = {}; // entity_id → citations
  const layerSelf: Record<string, number> = {}; // layer → self-cited count
  const domainAgg: Record<string, { count: number; type: string }> = {};
  let selfCitedTotal = 0;
  let measuredCells = 0; // status='ok' cells — the citation-rate denominator
  let erroredCells = 0; // status='error' cells — EXCLUDED from the denominator

  for (const engine of active) {
    const answers: EngineAnswer[] = [];
    for (const q of queries) {
      try {
        const r = await askWithRetry(engine, q.text);
        answers.push({ layer: q.layer, query: q.text, engine: engine.name, status: "ok", ...r });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ai_queries] ${engine.name} failed for "${q.text}":`, msg);
        answers.push({
          layer: q.layer,
          query: q.text,
          engine: engine.name,
          present: false,
          text: "",
          sources: [],
          status: "error",
          error_detail: msg,
        });
      }
      cost += ENGINE_COST[engine.name] ?? 0;
      await sleep(AI_ENGINE_DELAY_MS);
    }

    // Claude extracts competitors + source types for cells that actually answered.
    // Self-citation is NOT decided here (it's the deterministic matcher below), so
    // a parse failure never affects self_cited — degrade to "no competitors / no
    // typed sources" and carry on.
    let parsed: Awaited<ReturnType<typeof parseCitations>>;
    try {
      parsed = await parseCitations({ competitorNames, answers });
      if (answers.some((a) => a.status === "ok" && (a.text || a.sources.length > 0))) {
        cost += COST_INR.claudeParse;
      }
    } catch (err) {
      console.error(
        `[ai_queries] citation parse failed for ${engine.name}:`,
        err instanceof Error ? err.message : err,
      );
      parsed = answers.map(() => ({ competitors_cited: [], sources: [] }));
    }

    engineSelfCited[engine.name] = false;
    let engineMeasured = 0;
    answers.forEach((a, i) => {
      // ERROR CELL — a failed measurement is NEVER a measured negative. Store it
      // as status='error', self_cited=null, and exclude it from the denominator.
      // The raw response is empty because the engine never answered.
      if (a.status === "error") {
        erroredCells++;
        rows.push({
          run_id: run.id,
          clinic_id: run.clinic_id,
          layer: a.layer,
          query_text: a.query,
          engine: engine.name,
          status: "error",
          error_detail: a.error_detail ?? "engine call failed",
          self_cited: null,
          matched_string: null,
          competitors_cited: [],
          sources: [],
          answer_text: "",
          answer_sources: [],
        });
        return;
      }

      // MEASURED CELL.
      measuredCells++;
      engineMeasured++;
      const p = parsed[i] ?? { competitors_cited: [], sources: [] };

      // Deterministic, recorded self-citation (defensible against answer_text).
      const m = matchSelf({
        name: selfName,
        websiteUrl: selfWebsite,
        answerText: a.text,
        sources: a.sources,
      });
      if (m.matched) {
        selfCitedTotal++;
        engineSelfCited[engine.name] = true;
        layerSelf[a.layer] = (layerSelf[a.layer] ?? 0) + 1;
        mentionCount[self.id] = (mentionCount[self.id] ?? 0) + 1;
      }

      for (const cn of p.competitors_cited) {
        const ce = competitors.find((c) => c.display_name === cn);
        if (ce) mentionCount[ce.id] = (mentionCount[ce.id] ?? 0) + 1;
      }
      for (const s of p.sources) {
        if (!s.domain) continue;
        const cur = domainAgg[s.domain] ?? { count: 0, type: s.type };
        cur.count++;
        domainAgg[s.domain] = cur;
      }

      rows.push({
        run_id: run.id,
        clinic_id: run.clinic_id,
        layer: a.layer,
        query_text: a.query,
        engine: engine.name,
        status: "ok",
        error_detail: null,
        self_cited: m.matched,
        matched_string: m.matchedString,
        competitors_cited: p.competitors_cited,
        sources: p.sources,
        answer_text: a.text,
        answer_sources: a.sources,
      });
    });

    // A fully-errored engine has ZERO measurements → its per-engine boolean is
    // "not measured" (null), never a failure-derived false. (Extends the Break #3
    // rule to the engine-level signal; a partially-measured engine keeps a real
    // false because it genuinely measured at least one cell.)
    if (engineMeasured === 0) engineSelfCited[engine.name] = null;
  }

  if (rows.length > 0) {
    const { error } = await admin.from("ai_query_results").insert(rows);
    if (error) throw new Error(`Failed to write ai_query_results: ${error.message}`);
  }

  // --- rollup → audit_signals ---
  const signals: SignalInsert[] = [];
  const pushSelf = (
    metric_key: string,
    v: Pick<SignalInsert, "value_number" | "value_bool" | "value_text">,
    raw_meta: Record<string, unknown> | null = null,
  ) =>
    signals.push({
      run_id: run.id,
      entity_id: self.id,
      clinic_id: run.clinic_id,
      metric_key,
      source: "ai_citations",
      value_number: null,
      value_bool: null,
      value_text: null,
      ...v,
      raw_meta,
    });

  // per-engine self-cited booleans (existing 035 metrics). A fully-errored engine
  // is unmeasured (null) — never a failure-derived false.
  for (const engine of active) {
    const metric = ENGINE_METRIC[engine.name];
    const v = engineSelfCited[engine.name];
    if (metric) pushSelf(metric, { value_bool: v == null ? null : v });
  }

  // citation rate + source intelligence (the "which sites AI trusts" deliverable).
  // Denominator = MEASURED cells only; errored cells are excluded so a rate-limit
  // burst can't masquerade as "the engine didn't cite us". raw_meta reports both.
  const rate =
    measuredCells > 0 ? Math.round((selfCitedTotal / measuredCells) * 1000) / 10 : 0;
  const topDomains = Object.entries(domainAgg)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([domain, v]) => ({ domain, count: v.count, type: v.type }));
  pushSelf(
    "ai_citation_rate",
    { value_number: rate },
    {
      self_cited: selfCitedTotal,
      total: measuredCells,
      errored: erroredCells,
      source_intelligence: topDomains,
    },
  );

  const bestLayer =
    Object.entries(layerSelf).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  pushSelf("best_ai_layer", { value_text: bestLayer });

  // per-entity mention counts (self + competitors)
  for (const e of [self, ...competitors]) {
    signals.push({
      run_id: run.id,
      entity_id: e.id,
      clinic_id: run.clinic_id,
      metric_key: "ai_mentions_count",
      source: "ai_citations",
      value_number: mentionCount[e.id] ?? 0,
      value_bool: null,
      value_text: null,
      raw_meta: null,
    });
  }

  const { error: sigErr } = await admin.from("audit_signals").insert(signals);
  if (sigErr) throw new Error(`Failed to write ai signals: ${sigErr.message}`);

  return {
    costInr: cost,
    detail:
      `${active.length} engine(s) × ${queries.length} queries; ` +
      `self cited ${selfCitedTotal}/${measuredCells} measured` +
      (erroredCells ? ` (${erroredCells} errored, excluded)` : ""),
  };
}

async function loadTreatments(
  admin: SupabaseClient,
  clinicId: string,
): Promise<string[]> {
  const { data } = await admin
    .from("rate_cards")
    .select("treatment_name")
    .eq("clinic_id", clinicId)
    .eq("is_active", true)
    .order("base_price", { ascending: false })
    .limit(4);
  const names = (data ?? [])
    .map((r: { treatment_name?: string }) => r.treatment_name ?? "")
    .filter(Boolean);
  return names.length ? names : DENTAL_TREATMENTS_DEFAULT;
}
