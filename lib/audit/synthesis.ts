import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { AUDIT_SYNTH_MAX_TOKENS } from "@/lib/audit/config";
import type { SynthesisPayload } from "@/lib/audit/synthesis-input";

// The Stage 6 Claude call: turns the evidence-only payload into the 30-day plan
// JSON. YMYL rails are STRUCTURAL — the model may use ONLY the measured values
// in the payload, never a medical claim, never invented urgency, never a metric
// it wasn't given. It returns strict JSON; the wrapper validates + retries.

function model(): string {
  return (
    process.env.AUDIT_SYNTH_MODEL ||
    process.env.NOTES_AGENT_MODEL ||
    "claude-sonnet-4-6"
  );
}

const SYSTEM = [
  "You are a growth strategist for Indian dental clinics. You turn a measured",
  "competitive audit into a concrete 30-day action plan a non-technical clinic",
  "owner can execute themselves, paced across four weeks.",
  "",
  "HARD RULES (non-negotiable):",
  "- Use ONLY the numbers and facts in the provided JSON. Never invent a value,",
  "  a competitor behaviour, a statistic, or urgency. If it is not in the data,",
  "  it does not exist.",
  "- NEVER make a medical or clinical claim, promise outcomes, or reference",
  "  treatments beyond naming a service the data already names.",
  "- Every plan item MUST cite the exact measured values in `evidence`",
  '  (format "You: X · <Competitor>: Y") and list the `metric_keys` it addresses.',
  "  An action with no measured justification is forbidden.",
  "- Actions must be executable by a clinic owner: ask specific recent patients",
  "  for reviews, add a named GBP category, upload N photos, fix hours, add a",
  "  specific FAQ, write a named service description. NEVER 'improve your SEO'.",
  "- Language: warm Hinglish (Roman script), plain and encouraging.",
  "",
  "Respond with ONE strict JSON object and nothing else — no prose, no markdown",
  "fences.",
].join("\n");

type WatchArg = { name: string; multiple: number } | null;

function contract(payload: SynthesisPayload, watch: WatchArg): string {
  const prior = payload.prior
    ? [
        "",
        "PRIOR PLAN CONTEXT (acknowledge wins in Day 1's description, Hinglish):",
        JSON.stringify(payload.prior),
      ].join("\n")
    : "";

  // The ONLY strings allowed in an item's metric_keys — the exact metric_key
  // values from the gaps' signals. Listed explicitly so the model never cites a
  // moat_key (e.g. "conversion") or invents a key; the validator rejects anything
  // outside this set, and doing so burned whole retry cycles.
  const allowedKeys = Array.from(
    new Set(payload.gaps.flatMap((g) => (g.signals ?? []).map((s) => s.metric_key))),
  );

  return [
    "AUDIT DATA (measured; gaps are ordered by competitive priority):",
    JSON.stringify({
      clinic: payload.clinic,
      competitors: payload.competitors,
      gaps: payload.gaps,
    }),
    prior,
    "",
    "ALLOWED metric_keys — use ONLY these exact strings in any item's",
    '"metric_keys" (they are metric keys, NOT moat names like "conversion"; never',
    "invent, abbreviate, or use a moat_key):",
    JSON.stringify(allowedKeys),
    "",
    "Produce this JSON:",
    "{",
    '  "headline": "one plain sentence: the single biggest thing competitors do that this clinic does not",',
    '  "competitor_story": ["3-5 short observations, each naming a competitor and the measured numbers"],',
    '  "plan": [ 16 to 20 items spread across 30 days, each:',
    "    {",
    '      "day_number": 1-30,',
    '      "title": "short imperative",',
    '      "description": "concretely what to do, doable by a non-technical owner",',
    '      "evidence": "the measured values, e.g. \\"You: 3 of 20 reviews replied · Dr. Sharma: 18 of 20\\"",',
    '      "competitor_context": "what the competitor measurably does that makes this urgent",',
    '      "metric_keys": ["one or more strings from the ALLOWED metric_keys list above"],',
    '      "effort": "15-min | 1-hour | needs-help"',
    "    } ],",
    "}",
    "",
    "Pacing: spread the items across the full 30 days (roughly Week 1 = days 1-7,",
    "Week 2 = 8-14, Week 3 = 15-21, Week 4 = 22-30) — do NOT cram everything into",
    "the first week. Front-load impact: the biggest weighted_gap items go in Week 1",
    "(days 1-7), with at least one 15-min quick win in the first 7 days. Mix across",
    "moats (max ~7 items per moat). Heavier / compounding tasks can sit in later",
    "weeks.",
    ...(watch
      ? [
          "",
          `PRIORITY — Competitor watch: ${watch.name} is gaining Google reviews ` +
            `${watch.multiple}x faster than this clinic. Week 1 (days 1-7) MUST ` +
            "include a concrete review-generation counter-action (e.g. ask specific " +
            "recent happy patients for a Google review), citing total_google_reviews " +
            "in its metric_keys.",
        ]
      : []),
  ].join("\n");
}

export async function callSynthesisModel(
  payload: SynthesisPayload,
  feedback?: string,
  watch: WatchArg = null,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const userContent = feedback
    ? `${contract(payload, watch)}\n\nYour previous answer was rejected: ${feedback}\nFix it and return the corrected JSON only.`
    : contract(payload, watch);

  // A full 16–20 item Hinglish plan is a long generation (~6-7k output tokens);
  // at the old 120s client timeout it aborted mid-stream every attempt and the
  // stage failed after 3 dead retries (~6 min, no plan). 240s gives comfortable
  // headroom. maxRetries:1 covers a transient network blip.
  const client = new Anthropic({ apiKey, timeout: 240_000, maxRetries: 1 });
  const resp = await client.messages.create({
    model: model(),
    max_tokens: AUDIT_SYNTH_MAX_TOKENS,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  // A truncated response is unparseable JSON — surface it clearly instead of a
  // cryptic "Expected ',' or ']'" so a too-small cap is obvious.
  if (resp.stop_reason === "max_tokens") {
    throw new Error(
      `synthesis truncated at the ${AUDIT_SYNTH_MAX_TOKENS}-token cap — raise AUDIT_SYNTH_MAX_TOKENS`,
    );
  }

  const text = resp.content.find((b) => b.type === "text");
  const raw = text && text.type === "text" ? text.text : "";
  return parseJsonObject(raw);
}

// Tolerant extraction: grab the outermost {...} even if wrapped in a fence.
function parseJsonObject(s: string): Record<string, unknown> {
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("synthesis returned no JSON object");
  }
  return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
}
