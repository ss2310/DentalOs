import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SynthesisPayload } from "@/lib/audit/synthesis-input";

// The Stage 6 Claude call: turns the evidence-only payload into the 15-day plan
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
  "competitive audit into a concrete 15-day action plan a non-technical clinic",
  "owner can execute themselves.",
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

function contract(payload: SynthesisPayload): string {
  const prior = payload.prior
    ? [
        "",
        "PRIOR PLAN CONTEXT (acknowledge wins in Day 1's description, Hinglish):",
        JSON.stringify(payload.prior),
      ].join("\n")
    : "";

  return [
    "AUDIT DATA (measured; gaps are ordered by competitive priority):",
    JSON.stringify({
      clinic: payload.clinic,
      competitors: payload.competitors,
      gaps: payload.gaps,
    }),
    prior,
    "",
    "Produce this JSON:",
    "{",
    '  "headline": "one plain sentence: the single biggest thing competitors do that this clinic does not",',
    '  "competitor_story": ["3-5 short observations, each naming a competitor and the measured numbers"],',
    '  "plan": [ 12 to 15 items, each:',
    "    {",
    '      "day_number": 1-15,',
    '      "title": "short imperative",',
    '      "description": "concretely what to do, doable by a non-technical owner",',
    '      "evidence": "the measured values, e.g. \\"You: 3 of 20 reviews replied · Dr. Sharma: 18 of 20\\"",',
    '      "competitor_context": "what the competitor measurably does that makes this urgent",',
    '      "metric_keys": ["one or more metric_key strings from the gaps above"],',
    '      "effort": "15-min | 1-hour | needs-help"',
    "    } ],",
    "}",
    "",
    "Ordering: biggest weighted_gap items on days 1-5; put at least one 15-min",
    "quick win in the first 5 days; mix across moats (max ~5 items per moat).",
  ].join("\n");
}

export async function callSynthesisModel(
  payload: SynthesisPayload,
  feedback?: string,
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const userContent = feedback
    ? `${contract(payload)}\n\nYour previous answer was rejected: ${feedback}\nFix it and return the corrected JSON only.`
    : contract(payload);

  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });
  const resp = await client.messages.create({
    model: model(),
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

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
