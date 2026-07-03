import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
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

export async function POST(req: Request) {
  let body: {
    postTypeId?: string;
    tone?: string;
    topic?: string;
    context?: string;
    extras?: Record<string, string>;
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

  const remaining =
    (clinic.monthly_credits ?? 0) - (clinic.credits_used ?? 0);
  if (remaining < post.credits_cost) {
    return NextResponse.json(
      {
        error: `Not enough credits — this needs ${post.credits_cost}, you have ${remaining} left this month.`,
      },
      { status: 402 },
    );
  }

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
  };
  for (const [k, v] of Object.entries(extras)) {
    vars[k] = String(v ?? "").trim();
  }

  const system = fillTemplate(SHARED_SYSTEM_PROMPT, vars);
  const prompt = fillTemplate(post.prompt_template, vars);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "AI is not configured on the server yet." },
      { status: 500 },
    );
  }

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
    if (SCHEMA_TYPES.has(post.name)) {
      const split = splitSchema(content);
      content = split.main;
      schema = split.schema;
    }
    content = enforceLimits(post.name, content);

    // Recompute the url-encoded body in code (models can't url-encode reliably).
    const encoded =
      post.platform === "WhatsApp" ? encodeURIComponent(content) : null;

    // Charge credits per generation — Generate and Regenerate both cost, since
    // each is a real API call. Saving does not deduct again. Only reached after
    // a successful generation. (RLS scopes the update to the caller's clinic.)
    const newUsed = (clinic.credits_used ?? 0) + post.credits_cost;
    const { error: creditError } = await supabase
      .from("clinics")
      .update({ credits_used: newUsed })
      .eq("id", clinic.id);
    if (creditError) console.error("Failed to deduct credits:", creditError);
    const creditsLeft = (clinic.monthly_credits ?? 0) - newUsed;

    return NextResponse.json({ content, schema, encoded, creditsLeft });
  } catch (err) {
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
