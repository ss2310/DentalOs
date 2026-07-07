"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { assertTransition } from "@/lib/social/status";
import {
  validateYmyl,
  appendDisclaimers,
  describeViolations,
  gbpSoftWarnings,
} from "@/lib/social/ymyl";
import { loadComplianceRules } from "@/lib/social/generate";
import { verifiedProofPoints } from "@/lib/social/voice";
import { DEFAULT_VERTICAL } from "@/lib/vertical";

// Server actions for the Social Content Engine queue. Every status move goes
// through assertTransition (lib/social/status.mjs) — the ONE place the machine
// lives — so a crafted request can never skip approval. All reads/writes are
// session-scoped (RLS).

export type ActionState = { ok?: boolean; error?: string; violations?: string[] };

async function gate(): Promise<{ error?: string }> {
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }
  return {};
}

async function movePost(
  postId: string,
  to: "pending_approval" | "approved" | "posted_manually" | "rejected",
  extra: Record<string, unknown> = {},
): Promise<ActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const supabase = createClient();

  const { data: post } = await supabase
    .from("social_posts")
    .select("id, status, ymyl_flags")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "Post not found." };

  try {
    assertTransition(post.status, to);
  } catch {
    return { error: `This post can't move from ${post.status.replace("_", " ")} to ${to.replace("_", " ")}.` };
  }
  // A YMYL-flagged draft must be edited clean before it can enter the queue.
  if (to === "pending_approval" && post.ymyl_flags) {
    return { error: "Fix the flagged content issues before submitting for approval." };
  }

  // Optimistic-lock on the current status so two taps can't double-move.
  const { data: moved } = await supabase
    .from("social_posts")
    .update({ status: to, ...extra })
    .eq("id", postId)
    .eq("status", post.status)
    .select("id")
    .maybeSingle();
  if (!moved) return { error: "The post changed under you — reload and try again." };

  revalidatePath("/social");
  return { ok: true };
}

export async function submitForApproval(postId: string): Promise<ActionState> {
  return movePost(postId, "pending_approval");
}

export async function approvePost(postId: string): Promise<ActionState> {
  return movePost(postId, "approved", { approved_at: new Date().toISOString() });
}

export async function rejectPost(postId: string): Promise<ActionState> {
  return movePost(postId, "rejected");
}

/**
 * Manual publish completed: approved → posted_manually (+timestamp), and emit
 * the posting-activity event for the D-series signals (idempotent — the table
 * has a unique (post_id, event_type) index).
 */
export async function markPosted(postId: string): Promise<ActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const supabase = createClient();

  const { data: post } = await supabase
    .from("social_posts")
    .select("id, clinic_id, status, platform, campaign_type, format, scheduled_date")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { error: "Post not found." };

  const res = await movePost(postId, "posted_manually", {
    posted_at: new Date().toISOString(),
  });
  if (!res.ok) return res;

  // Emit-only signal loop (scoring wiring is D-series, not here). Stable shape.
  await supabase.from("posting_activity_events").upsert(
    {
      clinic_id: post.clinic_id,
      post_id: post.id,
      event_type: "posted_manually",
      platform: post.platform,
      campaign_type: post.campaign_type,
      payload: { format: post.format, scheduled_date: post.scheduled_date },
    },
    { onConflict: "post_id,event_type", ignoreDuplicates: true },
  );

  revalidatePath("/social");
  return { ok: true };
}

/**
 * Edit a caption — re-runs the YMYL validator (the spec's "edit re-runs YMYL").
 * Saves ONLY when clean (violations come back named); missing disclaimers are
 * auto-appended; GBP soft warnings are refreshed. Editing a flagged draft clean
 * clears its flags.
 */
export async function updatePostCaption(
  postId: string,
  captionRaw: string,
): Promise<ActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const caption = String(captionRaw ?? "").trim().slice(0, 5000);
  if (!caption) return { error: "The caption can't be empty." };

  const supabase = createClient();
  const [{ data: post }, { data: clinic }] = await Promise.all([
    supabase
      .from("social_posts")
      .select("id, status, platform, topic, campaign_type")
      .eq("id", postId)
      .maybeSingle(),
    supabase.from("clinics").select("id, phone, vertical").single(),
  ]);
  if (!post) return { error: "Post not found." };
  if (!clinic) return { error: "No clinic found." };
  if (post.status === "posted_manually" || post.status === "rejected") {
    return { error: "This post is finalised and can't be edited." };
  }

  const [rules, { data: profile }] = await Promise.all([
    loadComplianceRules(supabase, clinic.vertical ?? DEFAULT_VERTICAL),
    supabase
      .from("clinic_voice_profiles")
      .select("banned_phrases, required_disclaimers, proof_points")
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  const allowedFacts = [
    post.topic ?? "",
    post.campaign_type ?? "",
    clinic.phone ?? "",
    String(new Date().getFullYear()),
    ...verifiedProofPoints(profile?.proof_points ?? []).map(
      (p) => `${p.claim} ${p.source}`,
    ),
  ].filter(Boolean);

  const res = validateYmyl(caption, {
    bannedPhrases: [...rules.bannedPhrases, ...(profile?.banned_phrases ?? [])],
    requiredDisclaimers: profile?.required_disclaimers ?? [],
    allowedFacts,
  });
  if (!res.ok) {
    return {
      error: "The edit has content-safety issues — fix these and save again.",
      violations: describeViolations(res.violations),
    };
  }
  const finalCaption = appendDisclaimers(caption, res.missingDisclaimers);

  const { error: upErr } = await supabase
    .from("social_posts")
    .update({
      caption: finalCaption,
      ymyl_flags: null,
      soft_warnings: post.platform === "gbp" ? gbpSoftWarnings(finalCaption) : [],
    })
    .eq("id", postId);
  if (upErr) return { error: "Could not save the edit. Please try again." };

  revalidatePath("/social");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Brand Personality (clinic_voice_profiles) + Brand kit (clinic_brand_kits)
// ---------------------------------------------------------------------------

export type VoiceProfileInput = {
  identity_line: string;
  audience: string;
  tone_friendly: number;
  tone_conversational: number;
  language_mix: { instagram: string; facebook: string; gbp: string };
  banned_phrases: string[];
  cta_preference: "whatsapp" | "call" | "walkin";
  proof_points: { claim: string; source: string }[];
};

const LANGS = new Set(["english", "hindi", "hinglish"]);

export async function saveVoiceProfile(
  input: VoiceProfileInput,
): Promise<ActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const identity = String(input.identity_line ?? "").trim().slice(0, 300);
  if (!identity) return { error: "Please describe the clinic in one line." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  const clinicId = profileRow?.home_clinic_id;
  if (!clinicId) return { error: "No clinic found for user." };

  // Keep required disclaimers from the vertical defaults (the wizard doesn't
  // edit them in Phase 1) + whatever the previous version carried.
  const { data: prev } = await supabase
    .from("clinic_voice_profiles")
    .select("id, version, required_disclaimers")
    .eq("is_active", true)
    .maybeSingle();

  const clamp = (n: unknown) =>
    Math.max(0, Math.min(100, Math.round(Number(n ?? 50)) || 50));
  const mix = {
    instagram: LANGS.has(input.language_mix?.instagram) ? input.language_mix.instagram : "hinglish",
    facebook: LANGS.has(input.language_mix?.facebook) ? input.language_mix.facebook : "english",
    gbp: LANGS.has(input.language_mix?.gbp) ? input.language_mix.gbp : "english",
  };
  // Sourceless proof points are stored as 'unverified' — they exist for the
  // clinic to complete later, but NEVER reach generation (lib/social/voice).
  const proofPoints = (input.proof_points ?? [])
    .map((p) => ({
      claim: String(p.claim ?? "").trim().slice(0, 300),
      source: String(p.source ?? "").trim().slice(0, 300) || null,
    }))
    .filter((p) => p.claim)
    .map((p) => ({ ...p, status: p.source ? "verified" : "unverified" }));

  // Versioned: deactivate the old row, insert the new active one.
  if (prev) {
    await supabase
      .from("clinic_voice_profiles")
      .update({ is_active: false })
      .eq("id", prev.id);
  }
  const { error: insErr } = await supabase.from("clinic_voice_profiles").insert({
    clinic_id: clinicId,
    version: (prev?.version ?? 0) + 1,
    is_active: true,
    identity_line: identity,
    audience: String(input.audience ?? "").trim().slice(0, 300) || null,
    tone_friendly: clamp(input.tone_friendly),
    tone_conversational: clamp(input.tone_conversational),
    language_mix: mix,
    banned_phrases: (input.banned_phrases ?? [])
      .map((b) => String(b).trim())
      .filter(Boolean)
      .slice(0, 50),
    required_disclaimers: prev?.required_disclaimers ?? [],
    cta_preference: ["whatsapp", "call", "walkin"].includes(input.cta_preference)
      ? input.cta_preference
      : "whatsapp",
    proof_points: proofPoints,
    source: "wizard",
    created_by: user.id,
  });
  if (insErr) {
    // Restore the previous active profile if the insert failed.
    if (prev) {
      await supabase
        .from("clinic_voice_profiles")
        .update({ is_active: true })
        .eq("id", prev.id);
    }
    return { error: "Could not save. Please try again." };
  }

  revalidatePath("/social");
  revalidatePath("/social/brand");
  return { ok: true };
}

const KIT_FONTS = new Set(["inter", "poppins", "lora"]);
const HEX = /^#[0-9A-Fa-f]{6}$/;

export async function saveBrandKit(formData: FormData): Promise<ActionState> {
  const g = await gate();
  if (g.error) return { error: g.error };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  const clinicId = profileRow?.home_clinic_id;
  if (!clinicId) return { error: "No clinic found for user." };

  const primary = String(formData.get("primary_color") ?? "");
  const secondary = String(formData.get("secondary_color") ?? "");
  const font = String(formData.get("font") ?? "inter");
  if (!HEX.test(primary) || !HEX.test(secondary)) {
    return { error: "Colors must be 6-digit hex values." };
  }
  if (!KIT_FONTS.has(font)) return { error: "Pick a font from the list." };

  // Optional logo upload → brand-assets/<clinic>/logo.<ext> (RLS-scoped path).
  let logoPath: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > 2 * 1024 * 1024) return { error: "Logo must be under 2 MB." };
    const ext = logo.type === "image/jpeg" ? "jpg" : logo.type === "image/webp" ? "webp" : "png";
    if (!/^image\/(png|jpeg|webp)$/.test(logo.type)) {
      return { error: "Logo must be a PNG, JPG, or WebP image." };
    }
    logoPath = `${clinicId}/logo.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("brand-assets")
      .upload(logoPath, logo, { contentType: logo.type, upsert: true });
    if (upErr) return { error: "Logo upload failed. Please try again." };
  }

  const { error } = await supabase.from("clinic_brand_kits").upsert(
    {
      clinic_id: clinicId,
      primary_color: primary,
      secondary_color: secondary,
      font,
      ...(logoPath ? { logo_path: logoPath } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "clinic_id" },
  );
  if (error) return { error: "Could not save the brand kit." };

  revalidatePath("/social/brand");
  return { ok: true };
}
