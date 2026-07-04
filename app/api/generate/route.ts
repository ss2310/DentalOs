import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { spendCredits, refundCredit } from "@/lib/credits";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { nowIST, formatDate } from "@/lib/format";
import {
  fillTemplate,
  enforceLimits,
  splitSchema,
  extractWhatsAppMessage,
  SCHEMA_TYPES,
} from "@/lib/generate";
import {
  resolveForVertical,
  verticalDirective,
  DEFAULT_VERTICAL,
} from "@/lib/vertical";

// The Anthropic SDK requires the Node runtime (not Edge). The API key is read
// from ANTHROPIC_API_KEY on the server and is NEVER exposed to the client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-sonnet-4-6";

// The four long web types need room; 1,500 truncates them. Everything else fits.
function maxTokensFor(platform: string): number {
  return platform === "Website" ? 4000 : 1500;
}

// Shared system prompt — clinic identity + guardrails — filled with clinic
// vars and sent as `system` on every call.
const SHARED_SYSTEM_PROMPT = `You are the marketing content writer for {{clinic_name}}, a dental clinic in {{area}}, {{city}}, India, run by Dr. {{doctor_name}}. Contact: {{clinic_phone}}.
Voice: warm, trustworthy, human — like a caring family dentist, never corporate or salesy.
Hard rules for ALL content:
- Never make medical guarantees or promise outcomes ("100% painless", "guaranteed result", "best in city" are banned).
- Never invent facts, credentials, prices, offers, or specifics. If a detail isn't given to you, stay general or omit it.
- Never use fear-mongering or fake urgency.
- Never reveal or imply any individual patient's medical information.
- Prices only appear if explicitly provided in the context.
- Output ONLY the requested content. No preamble ("Here's your post..."), no explanation, no markdown code fences unless asked for schema.{{vertical_directive}}`;

// Injected into the system prompt ONLY for web-crawlable (Website) generations
// when AI-Citable Mode is on. Structures the page so AI search engines can quote
// it, and hard-locks YMYL safety (never fabricate health/cost/credential facts).
const AI_CITABLE_BLOCK = `AI-CITABLE MODE — structure this page so AI search engines (ChatGPT, Gemini, Perplexity, Google AI Overviews) can quote it verbatim:
- Lead with a self-contained 40–60 word DIRECT ANSWER to the page's core question, in the first paragraph (inverted pyramid). It must make sense quoted on its own, with no prior context.
- Use QUESTION-SHAPED H2/H3 headings, the way a patient would ask them.
- Write self-contained factual sentences that NAME THE ENTITY — "At {{clinic_name}} in {{area}}, {{city}}, …" — never a bare "we", "our", "it", or "this clinic".
- State the treatment, the city, and the clinic together in the same sentence where relevant (e.g. "root canal treatment at {{clinic_name}} in {{city}}").
- Put ALL numeric, cost, timeline, and comparative information in clean, LABELLED HTML <table>s with a header row — never bury numbers in prose.
- Include a visible "Last updated: {{today}}" line, and place the year in a heading where it reads naturally.
- Attribute clinical claims to Dr. {{doctor_name}}, using credentials ONLY if they were explicitly supplied in the inputs — never invent or embellish credentials.
- Emit the appropriate JSON-LD schema for this page type under a "SEO Schema" heading, and include a consistent NAP block in the copy: {{clinic_name}} · {{area}}, {{city}} · 📞 {{clinic_phone}}.

HARD YMYL RULES (health content — non-negotiable):
- NEVER fabricate statistics, cost figures, success rates, study citations, journal names, DOIs, or credentials.
- Use ONLY the numbers, references, and credentials explicitly supplied in the inputs or context.
- Where a required figure or source is missing, output a VISIBLE placeholder exactly like "[clinic to supply: <what is needed>]" instead of inventing anything.
- Make NO outcome guarantees and NO superlatives ("best", "guaranteed", "100% painless").`;

export async function POST(req: Request) {
  let body: {
    postTypeId?: string;
    tone?: string;
    topic?: string;
    context?: string;
    extras?: Record<string, string>;
    citable?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const postTypeId = String(body.postTypeId ?? "").trim();
  if (!postTypeId) {
    return NextResponse.json(
      { error: "Please choose a content type." },
      { status: 400 },
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Content generation is an owner/doctor feature (hidden from receptionists in
  // the nav + route-guarded); block a crafted request at the API too.
  const { data: gate } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(gate?.role as UserRole | undefined)) {
    return NextResponse.json(
      { error: "Content generation is available to owner or doctor accounts only." },
      { status: 403 },
    );
  }

  // RLS: post_types is a global read-only catalog; clinics returns own clinic.
  // The `vertical` column arrives with migration 026; if it isn't applied yet,
  // re-query without it so generation keeps working and behaves exactly as it
  // does pre-migration (vertical then reads as absent → treated as 'dental').
  const POST_COLS = "id, name, platform, credits_cost, prompt_template, extra_fields";
  const CLINIC_COLS =
    "id, business_name, city, area, doctor_name, phone, website_url, content_credits_balance";
  const [postRes, clinicRes] = await Promise.all([
    supabase.from("post_types").select(`${POST_COLS}, vertical`).eq("id", postTypeId).single(),
    supabase.from("clinics").select(`${CLINIC_COLS}, vertical`).single(),
  ]);
  const post = postRes.error
    ? (await supabase.from("post_types").select(POST_COLS).eq("id", postTypeId).single()).data
    : postRes.data;
  const clinic = clinicRes.error
    ? (await supabase.from("clinics").select(CLINIC_COLS).single()).data
    : clinicRes.data;

  if (!post) {
    return NextResponse.json(
      { error: "That content type could not be found." },
      { status: 404 },
    );
  }
  if (!clinic) {
    return NextResponse.json(
      { error: "No clinic found for this account." },
      { status: 400 },
    );
  }

  // The clinic's vertical drives content resolution. Default 'dental' so existing
  // clinics behave exactly as before.
  const clinicVertical =
    (clinic as { vertical?: string | null }).vertical ?? DEFAULT_VERTICAL;

  // Guard: the chosen type must apply to this clinic's vertical — its own, or the
  // shared (NULL) catalog. Never generate from another vertical's type. For a
  // dental clinic today every type is NULL, so this always passes.
  if (
    resolveForVertical<{ name: string; vertical?: string | null }>(
      [post],
      clinicVertical,
      (p) => p.name,
    ).length === 0
  ) {
    return NextResponse.json(
      { error: "That content type isn't available for your clinic." },
      { status: 404 },
    );
  }

  // The one templated prompt line. Empty for dental (byte-identical prompt);
  // "You write for a <Display> clinic." for any other vertical. Only the
  // non-default path needs the verticals lookup.
  let vertical_directive = "";
  if (clinicVertical !== DEFAULT_VERTICAL) {
    const { data: v } = await supabase
      .from("verticals")
      .select("display_name")
      .eq("id", clinicVertical)
      .maybeSingle();
    vertical_directive = verticalDirective(
      clinicVertical,
      v?.display_name ?? clinicVertical,
    );
  }

  const { date: istDate } = nowIST();

  // SEC-H2: hard caps on free-text so a crafted request can't blow up the
  // prompt (cost / DoS). Truncate rather than reject so normal input is unharmed.
  const TOPIC_MAX = 500;
  const CONTEXT_MAX = 4000;
  const EXTRA_MAX = 500;

  // SEC-M3: extras are accepted ONLY for keys this post type actually declares,
  // and never for a reserved built-in variable name. Combined with the merge
  // order below, user input can never rewrite {{clinic_name}} et al. or the
  // YMYL brand-safety block.
  const RESERVED_KEYS = new Set([
    "clinic_name", "doctor_name", "city", "area", "today",
    "clinic_phone", "website_url", "year", "tone", "topic", "context",
    "vertical_directive",
  ]);
  const allowedExtraKeys = new Set(
    (post.extra_fields?.inputs ?? []).map((i: { name: string }) => i.name),
  );
  const rawExtras = body.extras ?? {};
  const safeExtras: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawExtras)) {
    if (!allowedExtraKeys.has(k) || RESERVED_KEYS.has(k)) continue; // drop unknown/reserved
    safeExtras[k] = String(v ?? "").trim().slice(0, EXTRA_MAX);
  }

  const topic = String(body.topic ?? "").trim().slice(0, TOPIC_MAX);
  const context = String(body.context ?? "").trim().slice(0, CONTEXT_MAX);

  // Extras FIRST, built-ins LAST: the built-in clinic vars always win, so no
  // user-supplied extra can override the clinic identity or safety context.
  const vars: Record<string, string> = {
    ...safeExtras,
    clinic_name: clinic.business_name ?? "our clinic",
    city: clinic.city ?? "",
    area: clinic.area ?? "",
    doctor_name: clinic.doctor_name ?? "our dentist",
    clinic_phone: clinic.phone ?? "",
    website_url: clinic.website_url ?? "",
    tone: String(body.tone ?? "Professional"),
    topic,
    context,
    // Available to every template + the citable block.
    today: formatDate(istDate), // DD MMM YYYY, IST
    year: istDate.slice(0, 4),
    // Multi-vertical identity line (migration 026). Empty for dental.
    vertical_directive,
  };

  // AI-Citable Mode applies only to web-crawlable (Website) pages; ignore the
  // flag for GBP / Instagram / WhatsApp / review types even if it's sent.
  const citable = body.citable === true && post.platform === "Website";
  const systemTemplate = citable
    ? `${SHARED_SYSTEM_PROMPT}\n\n${AI_CITABLE_BLOCK}`
    : SHARED_SYSTEM_PROMPT;

  const system = fillTemplate(systemTemplate, vars);
  const prompt = fillTemplate(post.prompt_template, vars);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured on the server yet." },
      { status: 500 },
    );
  }

  // Spend content credits ATOMICALLY before the paid call (SEC-H1/L1). The RPC
  // charges in one row-locked statement, so concurrent requests can't all slip
  // through and get billed as one. `insufficient` = not enough credits; we never
  // reach Claude. Refunded below if the generation then fails.
  const cost = post.credits_cost;
  const spend = await spendCredits("content", cost, "generation");
  if (!spend.ok) {
    if ("insufficient" in spend) {
      return NextResponse.json(
        {
          error: `Not enough content credits — this needs ${cost}, you have ${Math.max(clinic.content_credits_balance ?? 0, 0)} left. Upgrade to add more.`,
          upgrade: true,
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: spend.error }, { status: 500 });
  }
  const creditsLeft = spend.balanceAfter;

  const refund = () => refundCredit(spend.ledgerId);

  try {
    // SEC-M2: cap wall-clock and retries so a hung/slow model can't run up
    // billed duration on a serverless invocation.
    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    // Sonnet 4.6, single-shot generation. No thinking config so the full
    // token budget goes to the content itself.
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokensFor(post.platform),
      system,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!raw) {
      await refund();
      return NextResponse.json(
        { error: "The AI returned an empty result. Please try again." },
        { status: 502 },
      );
    }

    // Post-process: pull the message body out of WhatsApp results, split the
    // inline JSON-LD out of web pages, then enforce the hard char limits.
    let content = raw;
    let schema: string | null = null;

    if (post.platform === "WhatsApp") {
      content = extractWhatsAppMessage(content);
    }
    // Split inline JSON-LD for types that always emit it, and for any citable
    // web page (the citable block instructs schema for all of them).
    if (SCHEMA_TYPES.has(post.name) || citable) {
      const split = splitSchema(content);
      content = split.main;
      schema = split.schema;
    }
    content = enforceLimits(post.name, content);

    // Recompute the url-encoded body in code (models can't url-encode reliably).
    const encoded =
      post.platform === "WhatsApp" ? encodeURIComponent(content) : null;

    // Credits were already reserved atomically before the call, so there is
    // nothing to deduct here — just report the post-reserve balance.
    return NextResponse.json({ content, schema, encoded, creditsLeft, citable });
  } catch (err) {
    // Generation failed after the reserve — refund so the clinic isn't charged.
    await refund();
    // Friendly, retryable message. Log the real error server-side only.
    console.error("Claude generation failed:", err);
    const status =
      err instanceof Anthropic.APIError ? err.status ?? 502 : 502;
    const message =
      status === 429
        ? "The AI is busy right now. Please wait a moment and try again."
        : "Something went wrong while generating. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
