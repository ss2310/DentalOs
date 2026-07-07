import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { spendCredits, refundCredit } from "@/lib/credits";
import { isAdminRole, type UserRole } from "@/lib/roles";
import {
  generateSocialVariants,
  checkSocialQuota,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/social/generate";

// Social Content Engine generation — the social sibling of /api/generate.
// Same rails: owner/doctor only, ATOMIC 1-content-credit spend before the paid
// call (refund on failure), server-side key only. One call returns every
// requested platform variant; rows land in social_posts as drafts (or straight
// into pending_approval for the weekly planner batch).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  let body: {
    topic?: string;
    campaignType?: string;
    platforms?: string[];
    format?: string;
    gbpPostType?: string;
    context?: string;
    sourceContentId?: string;
    scheduledDate?: string;
    batchId?: string;
    submitForApproval?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const topic = String(body.topic ?? "").trim();
  if (!topic) {
    return NextResponse.json({ error: "Please give a topic." }, { status: 400 });
  }
  const platforms = (body.platforms ?? []).filter((p): p is SocialPlatform =>
    (SOCIAL_PLATFORMS as readonly string[]).includes(p),
  );
  if (platforms.length === 0) {
    return NextResponse.json(
      { error: "Pick at least one platform." },
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
  const { data: gate } = await supabase
    .from("profiles")
    .select("role, home_clinic_id")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(gate?.role as UserRole | undefined)) {
    return NextResponse.json(
      { error: "Content generation is available to owner or doctor accounts only." },
      { status: 403 },
    );
  }

  const { data: clinic } = await supabase
    .from("clinics")
    .select(
      "id, business_name, city, area, doctor_name, phone, vertical, plan_id, content_credits_balance",
    )
    .single();
  if (!clinic) {
    return NextResponse.json({ error: "No clinic found for this account." }, { status: 400 });
  }

  // Monthly post quota (plans.social_posts_monthly) — checked BEFORE spending
  // a credit so a blocked clinic is never charged.
  const quota = await checkSocialQuota(supabase, clinic, platforms.length);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: `You've used ${quota.used} of your ${quota.limit} social posts this month. Upgrade your plan to post more.`,
        upgrade: true,
      },
      { status: 402 },
    );
  }

  // 1 content credit = 1 ready-to-post piece: the spend equals the number of
  // platform variants this call produces (image/carousel rendering is free —
  // it's local composition, no AI). Atomic + refunded if the model call fails,
  // same as /api/generate.
  const cost = platforms.length;
  const spend = await spendCredits("content", cost, "generation");
  if (!spend.ok) {
    if ("insufficient" in spend) {
      return NextResponse.json(
        {
          error: `Not enough content credits — this needs ${cost} (1 per post), you have ${Math.max(clinic.content_credits_balance ?? 0, 0)} left. Upgrade to add more.`,
          upgrade: true,
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: spend.error }, { status: 500 });
  }

  try {
    const { variants, voiceProfileId, anyFlagged } = await generateSocialVariants(
      supabase,
      clinic,
      {
        topic,
        campaignType: body.campaignType,
        platforms,
        format: body.format === "carousel" ? "carousel" : "single",
        gbpPostType:
          body.gbpPostType === "offer" || body.gbpPostType === "event"
            ? body.gbpPostType
            : "update",
        context: body.context,
        sourceContentId: body.sourceContentId || null,
      },
    );

    if (variants.every((v) => !v.caption)) {
      await refundCredit(spend.ledgerId);
      return NextResponse.json(
        { error: "The AI returned an empty result. Please try again." },
        { status: 502 },
      );
    }

    // Store one row per variant. Flagged variants are ALWAYS stored as drafts
    // (with the violations named) — they never enter the approval queue clean.
    const batchId = body.batchId || randomUUID();
    const submit = body.submitForApproval === true;
    const scheduledDate = /^\d{4}-\d{2}-\d{2}$/.test(body.scheduledDate ?? "")
      ? body.scheduledDate
      : null;

    const rows = variants
      .filter((v) => v.caption)
      .map((v) => ({
        clinic_id: clinic.id,
        batch_id: batchId,
        source_content_id: body.sourceContentId || null,
        voice_profile_id: voiceProfileId,
        topic,
        campaign_type: body.campaignType?.trim() || null,
        platform: v.platform,
        format: v.slides ? "carousel" : "single",
        caption: v.caption,
        hashtags: v.hashtags,
        carousel_slides: v.slides,
        gbp_post_type: v.gbp_post_type,
        soft_warnings: v.soft_warnings,
        ymyl_flags: v.ymyl_flags ? { violations: v.ymyl_flags } : null,
        scheduled_date: scheduledDate,
        status: submit && !v.ymyl_flags ? "pending_approval" : "draft",
        credits_deducted: 1, // 1 credit = 1 post variant
        created_by: user.id,
      }));

    const { data: inserted, error: insertErr } = await supabase
      .from("social_posts")
      .insert(rows)
      .select(
        "id, platform, format, caption, hashtags, carousel_slides, gbp_post_type, soft_warnings, ymyl_flags, status, scheduled_date, batch_id",
      );
    if (insertErr) {
      await refundCredit(spend.ledgerId);
      console.error("social_posts insert failed:", insertErr);
      return NextResponse.json(
        { error: "Could not save the posts. Please try again." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      posts: inserted ?? [],
      batchId,
      creditsLeft: spend.balanceAfter,
      anyFlagged,
      quota: { used: quota.used + rows.length, limit: quota.limit },
    });
  } catch (err) {
    await refundCredit(spend.ledgerId);
    console.error("Social generation failed:", err);
    const status = err instanceof Error && /platforms|configured/.test(err.message) ? 400 : 502;
    const message =
      status === 400
        ? err instanceof Error
          ? err.message
          : "Invalid request."
        : "Something went wrong while generating. Please try again.";
    return NextResponse.json({ error: message }, { status });
  }
}
