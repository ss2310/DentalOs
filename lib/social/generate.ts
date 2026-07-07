import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fillTemplate, trimOnWordBoundary } from "@/lib/generate";
import { SHARED_SYSTEM_PROMPT } from "@/lib/prompts";
import {
  resolveForVertical,
  verticalDirective,
  DEFAULT_VERTICAL,
} from "@/lib/vertical";
import { nowIST, formatDate } from "@/lib/format";
import {
  validateYmyl,
  appendDisclaimers,
  describeViolations,
  gbpSoftWarnings,
  type YmylViolation,
} from "@/lib/social/ymyl";
import {
  buildVoiceContext,
  buildDefaultProfile,
  verifiedProofPoints,
  languageLabel,
  type VoiceProfile,
} from "@/lib/social/voice";
import { exactlyFiveHashtags } from "@/lib/social/hashtags";

// Social Content Engine — platform shaping on top of the EXISTING generation
// pipeline: same model, same shared system prompt + vertical directive, same
// credit spend semantics (the route/action spends 1 content credit per
// generateSocialPost call before this runs). One Claude call returns every
// requested platform variant as structured JSON (forced tool-use, the same
// pattern as the voice-notes agent), then the deterministic YMYL validator
// gates storage: violations → ONE regenerate with the violations named →
// still failing → surfaced as a flagged draft, never silently stored clean.

const MODEL = "claude-sonnet-4-6";
export const SOCIAL_PLATFORMS = ["instagram", "facebook", "gbp"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type CarouselSlide = { title: string; body: string };

export type SocialVariant = {
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  slides: CarouselSlide[] | null;
  gbp_post_type: "update" | "offer" | "event" | null;
  soft_warnings: string[];
  ymyl_flags: string[] | null; // named violations when the retry also failed
};

export type GenerateSocialInput = {
  topic: string;
  campaignType?: string | null;
  platforms: SocialPlatform[];
  format?: "single" | "carousel";
  gbpPostType?: "update" | "offer" | "event";
  context?: string | null;
  sourceContentId?: string | null; // repurpose an existing Content Studio piece
};

type ClinicRow = {
  id: string;
  business_name: string | null;
  city: string | null;
  area: string | null;
  doctor_name: string | null;
  phone: string | null;
  vertical?: string | null;
  plan_id?: string | null;
};

// ---------------------------------------------------------------------------
// Voice profile: load the active one, or persist a safe default — generation
// NEVER runs personality-less.
// ---------------------------------------------------------------------------
export async function loadOrCreateVoiceProfile(
  supabase: SupabaseClient,
  clinic: ClinicRow,
): Promise<{ id: string | null; profile: VoiceProfile }> {
  const { data: active } = await supabase
    .from("clinic_voice_profiles")
    .select(
      "id, identity_line, audience, tone_friendly, tone_conversational, language_mix, banned_phrases, required_disclaimers, cta_preference, proof_points, source",
    )
    .eq("is_active", true)
    .maybeSingle();
  if (active) return { id: active.id as string, profile: active as unknown as VoiceProfile };

  // Skip path: build the safe default from vertical config + clinic record and
  // persist it (source='default') so posts can reference a real profile id.
  const rules = await loadComplianceRules(supabase, clinic.vertical ?? DEFAULT_VERTICAL);
  const profile = buildDefaultProfile(clinic, {
    bannedPhrases: rules.bannedPhrases,
    disclaimers: rules.disclaimers,
  });
  const { data: created } = await supabase
    .from("clinic_voice_profiles")
    .insert({
      clinic_id: clinic.id,
      version: 1,
      is_active: true,
      identity_line: profile.identity_line,
      audience: profile.audience,
      tone_friendly: profile.tone_friendly,
      tone_conversational: profile.tone_conversational,
      language_mix: profile.language_mix,
      banned_phrases: profile.banned_phrases,
      required_disclaimers: profile.required_disclaimers,
      cta_preference: profile.cta_preference,
      proof_points: profile.proof_points,
      source: "default",
    })
    .select("id")
    .maybeSingle();
  // Insert can race another request (partial unique on is_active): fall back to
  // using the in-memory default without an id — generation still runs voiced.
  return { id: (created?.id as string | undefined) ?? null, profile };
}

// ---------------------------------------------------------------------------
// Vertical catalogs (compliance + few-shots) via the ONE shared resolver.
// ---------------------------------------------------------------------------
export async function loadComplianceRules(
  supabase: SupabaseClient,
  vertical: string,
): Promise<{ bannedPhrases: string[]; disclaimers: string[]; guidance: string[] }> {
  const { data } = await supabase
    .from("compliance_rules")
    .select("kind, rule, vertical, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  const rows = resolveForVertical(
    (data ?? []) as { kind: string; rule: string; vertical?: string | null }[],
    vertical,
    (r) => `${r.kind}:${r.rule}`,
  );
  return {
    bannedPhrases: rows.filter((r) => r.kind === "banned_phrase").map((r) => r.rule),
    disclaimers: rows.filter((r) => r.kind === "disclaimer").map((r) => r.rule),
    guidance: rows.filter((r) => r.kind === "guidance").map((r) => r.rule),
  };
}

async function loadFewShots(
  supabase: SupabaseClient,
  vertical: string,
  platforms: SocialPlatform[],
): Promise<string[]> {
  const { data } = await supabase
    .from("few_shot_examples")
    .select("platform, example, vertical, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  const rows = resolveForVertical(
    (data ?? []) as { platform: string; example: string; vertical?: string | null }[],
    vertical,
    (r) => `${r.platform}:${r.example.slice(0, 60)}`,
  );
  const relevant = rows.filter(
    (r) => r.platform === "any" || platforms.includes(r.platform as SocialPlatform),
  );
  return relevant.slice(0, 3).map((r) => r.example);
}

// ---------------------------------------------------------------------------
// Monthly quota (plans.social_posts_monthly, calendar month, IST).
// ---------------------------------------------------------------------------
export async function checkSocialQuota(
  supabase: SupabaseClient,
  clinic: Pick<ClinicRow, "plan_id">,
  adding: number,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  let limit = 5; // safe floor when no plan row resolves (trial-equivalent)
  if (clinic.plan_id) {
    const { data: plan } = await supabase
      .from("plans")
      .select("social_posts_monthly")
      .eq("id", clinic.plan_id)
      .maybeSingle();
    if (plan && typeof plan.social_posts_monthly === "number") {
      limit = plan.social_posts_monthly;
    }
  }
  const { date: istDate } = nowIST();
  const monthStart = `${istDate.slice(0, 7)}-01`;
  const { count } = await supabase
    .from("social_posts")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthStart);
  const used = count ?? 0;
  return { allowed: used + adding <= limit, used, limit };
}

// ---------------------------------------------------------------------------
// Prompt assembly
// ---------------------------------------------------------------------------
function platformInstructions(
  p: SocialPlatform,
  opts: {
    profile: VoiceProfile;
    format: "single" | "carousel";
    gbpPostType: "update" | "offer" | "event";
    area: string;
    city: string;
  },
): string {
  const lang = `Language: ${languageLabel(opts.profile, p)}.`;
  if (p === "instagram") {
    const carousel =
      opts.format === "carousel"
        ? `\n  Also produce "slides": EXACTLY 6 carousel slides — slide 1 a scroll-stopping hook, slide 2 the problem, slides 3–5 one clear value point each, slide 6 the call to action. Each slide: "title" ≤8 words, "body" ≤30 words.`
        : "";
    return `- instagram: hook-first caption (first line must stop the scroll), under 2,200 characters. ${lang} Emoji amount should match the tone. Suggest exactly 5 hashtags mixing locality (${opts.area}, ${opts.city}) and the service/topic — no generic-only tags.${carousel}`;
  }
  if (p === "facebook") {
    return `- facebook: longer, conversational and story-like (2–4 short paragraphs). ${lang} At most 2 hashtags, or none — no hashtag stuffing.`;
  }
  return `- gbp: a Google Business Profile ${opts.gbpPostType.toUpperCase()} post, under 1,500 characters, plain and informative (no hashtags, no phone number in the text — the profile has a call button). ${lang}`;
}

// Forced tool schema — the model must return structured variants.
const DELIVER_TOOL: Anthropic.Tool = {
  name: "deliver_social_posts",
  description: "Deliver the finished social post variants.",
  input_schema: {
    type: "object" as const,
    properties: {
      variants: {
        type: "array",
        items: {
          type: "object",
          properties: {
            platform: { type: "string", enum: ["instagram", "facebook", "gbp"] },
            caption: { type: "string" },
            hashtags: { type: "array", items: { type: "string" } },
            slides: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  body: { type: "string" },
                },
                required: ["title", "body"],
              },
            },
          },
          required: ["platform", "caption"],
        },
      },
    },
    required: ["variants"],
  },
};

type RawVariant = {
  platform?: string;
  caption?: string;
  hashtags?: string[];
  slides?: { title?: string; body?: string }[];
};

async function callModel(
  client: Anthropic,
  system: string,
  userPrompt: string,
): Promise<RawVariant[]> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system,
    messages: [{ role: "user", content: userPrompt }],
    tools: [DELIVER_TOOL],
    tool_choice: { type: "tool", name: "deliver_social_posts" },
  });
  const tool = message.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
  );
  const input = tool?.input as { variants?: RawVariant[] } | undefined;
  return input?.variants ?? [];
}

// ---------------------------------------------------------------------------
// The engine. Caller has ALREADY: gated the role, checked quota, and spent the
// content credit (refunding on throw) — exactly like /api/generate.
// ---------------------------------------------------------------------------
export async function generateSocialVariants(
  supabase: SupabaseClient,
  clinic: ClinicRow,
  input: GenerateSocialInput,
): Promise<{
  variants: SocialVariant[];
  voiceProfileId: string | null;
  anyFlagged: boolean;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("AI is not configured on the server yet.");

  const vertical = clinic.vertical ?? DEFAULT_VERTICAL;
  const platforms = input.platforms.filter((p) =>
    (SOCIAL_PLATFORMS as readonly string[]).includes(p),
  );
  if (platforms.length === 0) throw new Error("No valid platforms requested.");
  const format = input.format === "carousel" ? "carousel" : "single";
  const gbpPostType = input.gbpPostType ?? "update";

  const [{ id: voiceProfileId, profile }, rules, fewShots] = await Promise.all([
    loadOrCreateVoiceProfile(supabase, clinic),
    loadComplianceRules(supabase, vertical),
    loadFewShots(supabase, vertical, platforms),
  ]);

  // Repurpose source: an existing Content Studio piece (RLS-scoped read).
  let sourceCopy = "";
  if (input.sourceContentId) {
    const { data: src } = await supabase
      .from("generated_content")
      .select("generated_copy, topic")
      .eq("id", input.sourceContentId)
      .maybeSingle();
    if (src?.generated_copy) {
      sourceCopy = String(src.generated_copy).slice(0, 3000);
    }
  }

  // Vertical directive (same line the Content Studio route uses).
  let vertical_directive = "";
  if (vertical !== DEFAULT_VERTICAL) {
    const { data: v } = await supabase
      .from("verticals")
      .select("display_name")
      .eq("id", vertical)
      .maybeSingle();
    vertical_directive = verticalDirective(vertical, v?.display_name ?? vertical);
  }

  const { date: istDate } = nowIST();
  const topic = String(input.topic ?? "").trim().slice(0, 500);
  const context = String(input.context ?? "").trim().slice(0, 4000);
  const campaignType = String(input.campaignType ?? "").trim().slice(0, 200);

  const vars: Record<string, string> = {
    clinic_name: clinic.business_name ?? "our clinic",
    city: clinic.city ?? "",
    area: clinic.area ?? "",
    doctor_name: clinic.doctor_name ?? "our doctor",
    clinic_phone: clinic.phone ?? "",
    today: formatDate(istDate),
    year: istDate.slice(0, 4),
    vertical_directive,
  };

  const voiceBlock = buildVoiceContext(profile, clinic, null);
  const guidanceBlock =
    rules.guidance.length > 0
      ? `\n\nVERTICAL COMPLIANCE RULES (non-negotiable):\n${rules.guidance.map((g) => `- ${g}`).join("\n")}`
      : "";
  const system = `${fillTemplate(SHARED_SYSTEM_PROMPT, vars)}\n\n${voiceBlock}${guidanceBlock}`;

  const fewShotBlock =
    fewShots.length > 0
      ? `\nSTYLE EXAMPLES — match this register (especially the natural Hinglish; never translate word-for-word):\n${fewShots.map((f, i) => `Example ${i + 1}:\n${f}`).join("\n\n")}\n`
      : "";

  const userPrompt = `Create social posts about this topic for the platforms listed below, then deliver them with the deliver_social_posts tool (one variant per platform).

TOPIC: ${topic}
${campaignType ? `CAMPAIGN: ${campaignType}` : ""}
${context ? `CONTEXT (the ONLY extra facts you may use):\n${context}` : ""}
${sourceCopy ? `REPURPOSE THIS EXISTING PIECE (adapt, don't copy verbatim):\n${sourceCopy}` : ""}
${fewShotBlock}
PLATFORMS:
${platforms.map((p) => platformInstructions(p, { profile, format, gbpPostType, area: vars.area, city: vars.city })).join("\n")}`;

  // Allowed facts for the poisoned-stat gate: the inputs + verified proof
  // points + clinic contact + today's date. Nothing else numeric may appear.
  const allowedFacts = [
    topic,
    context,
    campaignType,
    sourceCopy,
    clinic.phone ?? "",
    vars.today,
    vars.year,
    ...verifiedProofPoints(profile.proof_points).map((p) => `${p.claim} ${p.source}`),
  ].filter(Boolean);

  const ymylOpts = {
    bannedPhrases: [...rules.bannedPhrases, ...(profile.banned_phrases ?? [])],
    requiredDisclaimers: profile.required_disclaimers ?? [],
    allowedFacts,
  };

  const client = new Anthropic({ apiKey, timeout: 90_000, maxRetries: 1 });

  const shape = (raw: RawVariant[]): SocialVariant[] =>
    platforms.map((p) => {
      const v = raw.find((r) => r.platform === p);
      let caption = String(v?.caption ?? "").trim();
      if (p === "instagram") caption = trimOnWordBoundary(caption, 2200);
      const hashtags =
        p === "instagram"
          ? exactlyFiveHashtags(v?.hashtags, {
              area: clinic.area,
              city: clinic.city,
              topic,
              clinicName: (clinic.business_name ?? "").replace(/[^A-Za-z0-9]/g, ""),
            })
          : (v?.hashtags ?? []).slice(0, 2);
      const slides =
        p === "instagram" && format === "carousel"
          ? (v?.slides ?? [])
              .slice(0, 6)
              .map((s) => ({
                title: String(s.title ?? "").trim(),
                body: String(s.body ?? "").trim(),
              }))
          : null;
      return {
        platform: p,
        caption,
        hashtags,
        slides,
        gbp_post_type: p === "gbp" ? gbpPostType : null,
        soft_warnings: p === "gbp" ? gbpSoftWarnings(caption) : [],
        ymyl_flags: null,
      };
    });

  const textOf = (v: SocialVariant) =>
    [v.caption, ...(v.slides ?? []).map((s) => `${s.title} ${s.body}`)].join("\n");

  // Attempt 1 → validate → (attempt 2 with the violations named) → surface.
  let variants = shape(await callModel(client, system, userPrompt));

  const failing = new Map<SocialPlatform, YmylViolation[]>();
  for (const v of variants) {
    const res = validateYmyl(textOf(v), ymylOpts);
    if (!res.ok) failing.set(v.platform, res.violations);
    else if (res.missingDisclaimers.length > 0) {
      v.caption = appendDisclaimers(v.caption, res.missingDisclaimers);
    }
  }

  if (failing.size > 0) {
    const named = Array.from(failing.entries())
      .map(
        ([p, viol]) => `${p}: ${describeViolations(viol).join("; ")}`,
      )
      .join("\n");
    const retryPrompt = `${userPrompt}\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED by the medical-content validator. Violations:\n${named}\nRewrite the affected platform posts WITHOUT these problems. Use no numbers, prices, or study claims that were not explicitly supplied above.`;
    const retry = shape(await callModel(client, system, retryPrompt));

    // Keep passing variants from attempt 1; take retries only for the failures.
    variants = variants.map((v) => {
      if (!failing.has(v.platform)) return v;
      const r = retry.find((x) => x.platform === v.platform) ?? v;
      const res = validateYmyl(textOf(r), ymylOpts);
      if (res.ok) {
        if (res.missingDisclaimers.length > 0) {
          r.caption = appendDisclaimers(r.caption, res.missingDisclaimers);
        }
        return r;
      }
      // Still failing → surface flagged with the violations NAMED.
      return { ...r, ymyl_flags: describeViolations(res.violations) };
    });
  }

  return {
    variants,
    voiceProfileId,
    anyFlagged: variants.some((v) => v.ymyl_flags !== null),
  };
}
