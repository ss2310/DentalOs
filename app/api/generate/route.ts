import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { nowIST, formatDate } from "@/lib/format";
import {
  fillTemplate,
  enforceLimits,
  splitSchema,
  extractWhatsAppMessage,
  SCHEMA_TYPES,
} from "@/lib/generate";

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
- Output ONLY the requested content. No preamble ("Here's your post..."), no explanation, no markdown code fences unless asked for schema.`;

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
  const [{ data: post }, { data: clinic }] = await Promise.all([
    supabase
      .from("post_types")
      .select("id, name, platform, credits_cost, prompt_template")
      .eq("id", postTypeId)
      .single(),
    supabase
      .from("clinics")
      .select("id, business_name, city, area, doctor_name, phone, website_url, monthly_credits, credits_used")
      .single(),
  ]);

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

  const { date: istDate } = nowIST();
  const extras = body.extras ?? {};
  const vars: Record<string, string> = {
    clinic_name: clinic.business_name ?? "our clinic",
    city: clinic.city ?? "",
    area: clinic.area ?? "",
    doctor_name: clinic.doctor_name ?? "our dentist",
    clinic_phone: clinic.phone ?? "",
    website_url: clinic.website_url ?? "",
    tone: String(body.tone ?? "Professional"),
    topic: String(body.topic ?? "").trim(),
    context: String(body.context ?? "").trim(),
    // Available to every template + the citable block.
    today: formatDate(istDate), // DD MMM YYYY, IST
    year: istDate.slice(0, 4),
  };
  for (const [k, v] of Object.entries(extras)) {
    vars[k] = String(v ?? "").trim();
  }

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

  // Reserve credits ATOMICALLY before the paid call (SEC-H1/L1). The RPC
  // charges in one row-locked statement, so concurrent requests can't all
  // slip through and get billed as one. NULL = not enough credits; we never
  // reach Claude. Refunded below if the generation then fails.
  const cost = post.credits_cost;
  const reference = crypto.randomUUID();
  const { data: reservedLeft, error: reserveError } = await supabase.rpc(
    "reserve_credits",
    { p_cost: cost, p_reason: "content_generation", p_reference: reference },
  );
  if (reserveError) {
    console.error("Credit reserve failed:", reserveError);
    return NextResponse.json(
      { error: "Could not check your credits. Please try again." },
      { status: 500 },
    );
  }
  if (reservedLeft === null) {
    const remaining =
      (clinic.monthly_credits ?? 0) - (clinic.credits_used ?? 0);
    return NextResponse.json(
      {
        error: `Not enough credits — this needs ${cost}, you have ${Math.max(remaining, 0)} left this month.`,
      },
      { status: 402 },
    );
  }
  const creditsLeft = reservedLeft as number;

  const refund = () =>
    supabase.rpc("refund_credits", { p_reference: reference });

  try {
    const client = new Anthropic({ apiKey });
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
