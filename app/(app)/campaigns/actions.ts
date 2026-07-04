"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { spendCredits, refundCredit } from "@/lib/credits";
import { getUserRole, isAdminRole } from "@/lib/roles";
import {
  resolveSegmentPatients,
  SEGMENT_VALUES,
  type SegmentType,
} from "./segments";

const MODEL = "claude-sonnet-4-6";
const MESSAGE_MAX = 2000;

export type CreateState = { id?: string; error?: string };
export type SendState = { ok?: boolean; error?: string };
export type DraftState = { message?: string; error?: string };

function isSegment(v: string): v is SegmentType {
  return SEGMENT_VALUES.has(v as SegmentType);
}

// ---------------------------------------------------------------------------
// Live preview: how many patients this segment currently targets.
// ---------------------------------------------------------------------------
export async function previewSegment(
  segment: string,
  treatmentId?: string,
): Promise<{ count: number }> {
  if (!isSegment(segment)) return { count: 0 };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { count: 0 };
  const patients = await resolveSegmentPatients(
    supabase,
    segment,
    treatmentId || undefined,
  );
  return { count: patients.length };
}

// ---------------------------------------------------------------------------
// Create a draft campaign. Snapshots the current recipient patient_ids into
// segment_filter so the detail page + progress total stay stable even if the
// live segment drifts later.
// ---------------------------------------------------------------------------
export async function createCampaign(input: {
  name: string;
  segment: string;
  treatmentId?: string;
  message: string;
}): Promise<CreateState> {
  const name = input.name.trim().slice(0, 120);
  if (!name) return { error: "Campaign name is required." };
  const message = input.message.trim();
  if (!message) return { error: "Write a message template first." };
  if (!isSegment(input.segment)) return { error: "Pick a valid segment." };
  if (input.segment === "treatment_followup" && !input.treatmentId) {
    return { error: "Pick a treatment to follow up on." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("home_clinic_id")
    .eq("id", user.id)
    .single();
  if (!profile?.home_clinic_id) return { error: "No clinic found for user." };

  const patients = await resolveSegmentPatients(
    supabase,
    input.segment,
    input.treatmentId || undefined,
  );

  const segment_filter: Record<string, unknown> = {
    patient_ids: patients.map((p) => p.id),
  };
  if (input.segment === "treatment_followup") {
    segment_filter.treatment_id = input.treatmentId;
  }

  const { data, error } = await supabase
    .from("campaigns")
    .insert({
      clinic_id: profile.home_clinic_id,
      name,
      segment_type: input.segment,
      segment_filter,
      message_template: message.slice(0, MESSAGE_MAX),
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createCampaign failed:", error);
    return { error: "Could not create the campaign. Please try again." };
  }

  revalidatePath("/campaigns");
  return { id: data.id };
}

// ---------------------------------------------------------------------------
// AI draft (owner/doctor only, 1 credit) — writes a Hinglish WhatsApp message
// for the segment, KEEPING the {name}/{clinic}/{doctor}/{phone} placeholders so
// each row can be personalised at send time. Mirrors the atomic reserve/refund
// credit pattern used by /api/generate and the insight report.
// ---------------------------------------------------------------------------
const DRAFT_SYSTEM = `You write short, warm WhatsApp messages in Hinglish (Roman-script Hindi + English) for an Indian dental clinic to send its own patients.
Hard rules:
- Keep it to 2–4 short lines. Friendly and human, like a caring family clinic — never corporate or pushy.
- You MUST keep these placeholders EXACTLY as written, unchanged: {name}, {clinic}, {doctor}, {phone}. Start the message with "Hi {name} ji,". Sign off referencing {clinic} and include {phone} for callback.
- Never make medical guarantees or promises ("100% painless", "guaranteed", "best in city" are banned). No fear-mongering, no fake urgency, no fabricated offers, prices, or facts.
- Never reveal or imply any medical detail about the patient.
- Output ONLY the message text — no preamble, no quotes, no explanation.`;

function draftBrief(segment: SegmentType, treatmentName?: string): string {
  switch (segment) {
    case "dormant_6mo":
    case "dormant_12mo":
      return "Goal: a gentle win-back. The patient hasn't visited in a while. Warmly say you've missed them and invite them to book a check-up.";
    case "treatment_followup":
      return `Goal: a caring follow-up after their ${treatmentName || "treatment"}. Ask how they're doing and invite them for a follow-up visit if needed.`;
    case "outstanding_balance":
      return "Goal: a polite, respectful reminder that a payment balance is still pending. Keep it kind and non-threatening; invite them to clear it at their convenience or call if there's any issue.";
    case "birthday_month":
      return "Goal: a warm birthday wish from the clinic. Keep it celebratory; you may gently invite them for a check-up but the wish comes first.";
    default:
      return "Goal: a friendly note inviting the patient to visit the clinic.";
  }
}

export async function draftCampaignMessage(
  segment: string,
  treatmentName?: string,
): Promise<DraftState> {
  if (!isSegment(segment)) return { error: "Pick a valid segment first." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isAdminRole(await getUserRole())) {
    return { error: "Only an owner or doctor can use AI draft." };
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select("business_name, city, area, doctor_name, content_credits_balance")
    .single();
  if (!clinic) return { error: "No clinic found for this account." };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "AI is not configured on the server yet." };

  // Spend 1 content credit atomically before the paid call; refund on failure.
  const cost = 1;
  const spend = await spendCredits("content", cost, "generation");
  if (!spend.ok) {
    if ("insufficient" in spend) {
      return {
        error: `Not enough content credits — this needs ${cost}, you have ${Math.max(clinic.content_credits_balance ?? 0, 0)} left. Upgrade to add more.`,
      };
    }
    return { error: spend.error };
  }
  const refund = () => refundCredit(spend.ledgerId);

  const brief = `${draftBrief(segment, treatmentName)}\nClinic: ${clinic.business_name ?? "our clinic"} in ${clinic.area ?? ""}, ${clinic.city ?? ""}. Dentist: Dr. ${clinic.doctor_name ?? "our dentist"}.\nRemember: keep {name}, {clinic}, {doctor}, {phone} literally in the message.`;

  try {
    const anthropic = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: DRAFT_SYSTEM,
      messages: [{ role: "user", content: brief }],
    });
    const text = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) {
      await refund();
      return { error: "The AI returned an empty draft. Please try again." };
    }
    return { message: text.slice(0, MESSAGE_MAX) };
  } catch (err) {
    await refund();
    console.error("Campaign draft generation failed:", err);
    return { error: "Something went wrong drafting. Please try again." };
  }
}

// ---------------------------------------------------------------------------
// Record one manual WhatsApp send (deliberately one-click-per-patient — wa.me
// can't bulk send, and manual sends keep the clinic's number safe from bans).
// ---------------------------------------------------------------------------
export async function sendCampaignMessage(
  campaignId: string,
  patientId: string,
): Promise<SendState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, clinic_id, status")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { error: "Campaign not found." };
  if (campaign.status === "done") {
    return { error: "This campaign is marked done." };
  }

  // Anti-duplicate: never double-count a patient already sent to.
  const { data: existing } = await supabase
    .from("campaign_sends")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("patient_id", patientId)
    .not("sent_at", "is", null)
    .maybeSingle();
  if (existing) return { ok: true };

  const { error: insertError } = await supabase.from("campaign_sends").insert({
    clinic_id: campaign.clinic_id,
    campaign_id: campaignId,
    patient_id: patientId,
    sent_at: new Date().toISOString(),
    sent_by: user.id,
  });
  if (insertError) {
    console.error("campaign send insert failed:", insertError);
    return { error: "Could not record the send. Please try again." };
  }

  // Recompute sent_count from the ledger (race-tolerant, self-healing) and move
  // a draft campaign to 'active' on its first send.
  const { count } = await supabase
    .from("campaign_sends")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .not("sent_at", "is", null);
  await supabase
    .from("campaigns")
    .update({
      sent_count: count ?? 0,
      ...(campaign.status === "draft" ? { status: "active" } : {}),
    })
    .eq("id", campaignId);

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Finish a campaign.
// ---------------------------------------------------------------------------
export async function markCampaignDone(
  campaignId: string,
): Promise<SendState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("campaigns")
    .update({ status: "done" })
    .eq("id", campaignId);
  if (error) {
    console.error("markCampaignDone failed:", error);
    return { error: "Could not update. Please try again." };
  }

  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return { ok: true };
}
