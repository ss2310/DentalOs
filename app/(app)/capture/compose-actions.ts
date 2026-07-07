"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { spendCredits, refundCredit } from "@/lib/credits";
import { fillTemplate } from "@/lib/generate";
import { SHARED_SYSTEM_PROMPT } from "@/lib/prompts";
import { nowIST, formatDate } from "@/lib/format";
import { SOCIAL_CONSENT } from "@/lib/capture/consent";
import { CONSENT_LINE } from "@/lib/capture/compose";
import { validateYmyl, describeViolations } from "@/lib/social/ymyl";
import { loadComplianceRules, checkSocialQuota } from "@/lib/social/generate";
import { buildVoiceContext, buildDefaultProfile } from "@/lib/social/voice";
import { verticalDirective, DEFAULT_VERTICAL } from "@/lib/vertical";
import { assertTransition } from "@/lib/social/status";

// S2 caption writing + queue handoff. Captions go through the Content Studio
// YMYL rails (shared system prompt + the deterministic validator): factual,
// ZERO medical claims — the prompt forbids outcome language and the validator
// blocks anything numeric that wasn't supplied. 1 content credit per caption
// call. Both actions re-run the consent gate IN THE QUERY.

const MODEL = "claude-sonnet-4-6";

export type CaptionState = {
  ok?: boolean;
  error?: string;
  options?: string[];
  creditsLeft?: number;
};

const CAPTION_TOOL: Anthropic.Tool = {
  name: "deliver_captions",
  description: "Deliver the three caption options.",
  input_schema: {
    type: "object" as const,
    properties: {
      captions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    },
    required: ["captions"],
  },
};

export async function generateMomentCaptions(momentId: string): Promise<CaptionState> {
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }
  const supabase = createClient();

  const [{ data: moment }, { data: clinic }] = await Promise.all([
    supabase
      .from("capture_moments")
      .select("id, treatment")
      .eq("id", momentId)
      .eq("consent_type", SOCIAL_CONSENT) // consent gate — in the query
      .maybeSingle(),
    supabase
      .from("clinics")
      .select("id, business_name, city, area, doctor_name, phone, vertical, content_credits_balance")
      .single(),
  ]);
  if (!moment) return { error: "Moment not found, or consent doesn't cover social." };
  if (!clinic) return { error: "No clinic found." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "AI is not configured on the server yet." };

  const vertical = clinic.vertical ?? DEFAULT_VERTICAL;
  const [rules, { data: profileRow }] = await Promise.all([
    loadComplianceRules(supabase, vertical),
    supabase
      .from("clinic_voice_profiles")
      .select(
        "identity_line, audience, tone_friendly, tone_conversational, language_mix, banned_phrases, required_disclaimers, cta_preference, proof_points",
      )
      .eq("is_active", true)
      .maybeSingle(),
  ]);
  const profile =
    (profileRow as never) ??
    buildDefaultProfile(clinic, { bannedPhrases: [], disclaimers: rules.disclaimers });

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
  const vars = {
    clinic_name: clinic.business_name ?? "our clinic",
    city: clinic.city ?? "",
    area: clinic.area ?? "",
    doctor_name: clinic.doctor_name ?? "our doctor",
    clinic_phone: clinic.phone ?? "",
    today: formatDate(istDate),
    year: istDate.slice(0, 4),
    vertical_directive,
  };
  const system = `${fillTemplate(SHARED_SYSTEM_PROMPT, vars)}\n\n${buildVoiceContext(profile, clinic, "instagram")}`;
  const userPrompt = `A real patient of the clinic consented to share their ${moment.treatment ? `"${moment.treatment}" ` : ""}result photo on Instagram. The image itself carries the line "${CONSENT_LINE}".

Write EXACTLY 3 different Instagram caption options for this post, then deliver them with the deliver_captions tool. Rules:
- Factual and warm. ZERO medical claims: no outcomes promised, no "results", no pain/success language, no timelines, no prices.
- Celebrate the patient's confidence and thank them for sharing — never describe their condition or treatment details.
- Each option: 2–4 short lines + a gentle CTA. No hashtags (added separately).
- The three options should differ in angle: (1) gratitude, (2) confidence/celebration, (3) an invitation to readers.`;

  // 1 content credit for the caption call (composition itself is free).
  const spend = await spendCredits("content", 1, "generation");
  if (!spend.ok) {
    if ("insufficient" in spend) {
      return {
        error: `Not enough content credits — this needs 1, you have ${Math.max(clinic.content_credits_balance ?? 0, 0)} left.`,
      };
    }
    return { error: spend.error };
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1200,
      system,
      messages: [{ role: "user", content: userPrompt }],
      tools: [CAPTION_TOOL],
      tool_choice: { type: "tool", name: "deliver_captions" },
    });
    const tool = message.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const raw = ((tool?.input as { captions?: string[] } | undefined)?.captions ?? [])
      .map((c) => String(c).trim())
      .filter(Boolean);

    // The deterministic YMYL gate — options with violations are dropped, and
    // nothing numeric that wasn't supplied can survive.
    const ymylOpts = {
      bannedPhrases: [
        ...rules.bannedPhrases,
        ...(((profile as { banned_phrases?: string[] }).banned_phrases) ?? []),
      ],
      requiredDisclaimers: [],
      allowedFacts: [moment.treatment ?? "", clinic.phone ?? "", vars.year],
    };
    const clean = raw.filter((c) => validateYmyl(c, ymylOpts).ok);
    if (clean.length === 0) {
      await refundCredit(spend.ledgerId);
      const flagged = raw.map((c) =>
        describeViolations(validateYmyl(c, ymylOpts).violations).join("; "),
      );
      console.error("Moment captions all failed YMYL:", flagged);
      return { error: "The captions failed the content-safety check — try again." };
    }
    return { ok: true, options: clean, creditsLeft: spend.balanceAfter };
  } catch (err) {
    await refundCredit(spend.ledgerId);
    console.error("Moment caption generation failed:", err);
    return { error: "Something went wrong while writing captions. Please try again." };
  }
}

export type CreatePostState = { ok?: boolean; error?: string; postId?: string };

/**
 * Hand the composed asset to the ONE social queue: a normal social_posts row
 * (image_source='moment_capture') that flows draft-less into pending_approval
 * and then the same approval + manual-publish screens as every other post.
 */
export async function createMomentPost(input: {
  momentId: string;
  caption: string;
  renderPaths: string[];
}): Promise<CreatePostState> {
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }
  const caption = String(input.caption ?? "").trim().slice(0, 2200);
  const renderPaths = (input.renderPaths ?? []).filter(Boolean).slice(0, 4);
  if (!caption) return { error: "Pick a caption first." };
  if (renderPaths.length === 0) return { error: "Compose the image first." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [{ data: moment }, { data: clinic }] = await Promise.all([
    supabase
      .from("capture_moments")
      .select("id, clinic_id, treatment")
      .eq("id", input.momentId)
      .eq("consent_type", SOCIAL_CONSENT) // consent gate — in the query
      .maybeSingle(),
    supabase.from("clinics").select("id, plan_id").single(),
  ]);
  if (!moment) return { error: "Moment not found, or consent doesn't cover social." };
  if (!clinic) return { error: "No clinic found." };

  // Same monthly quota as every other social post.
  const quota = await checkSocialQuota(supabase, clinic, 1);
  if (!quota.allowed) {
    return {
      error: `You've used ${quota.used} of your ${quota.limit} social posts this month. Upgrade to post more.`,
    };
  }

  // Same machine as every post: rows enter at pending_approval via draft.
  assertTransition("draft", "pending_approval");

  const { data: created, error } = await supabase
    .from("social_posts")
    .insert({
      clinic_id: moment.clinic_id,
      source_moment_id: moment.id,
      topic: moment.treatment ? `Patient moment — ${moment.treatment}` : "Patient moment",
      campaign_type: "Moment Capture",
      platform: "instagram",
      format: "single",
      caption,
      hashtags: [],
      image_source: "moment_capture",
      render_paths: renderPaths,
      status: "pending_approval",
      credits_deducted: 1, // the caption call
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !created) {
    console.error("moment post insert failed:", error);
    return { error: "Could not queue the post. Please try again." };
  }

  revalidatePath("/social");
  revalidatePath("/capture/gallery");
  return { ok: true, postId: created.id as string };
}
