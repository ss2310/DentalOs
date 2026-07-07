import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { spendCredits, refundCredit } from "@/lib/credits";
import {
  renderPostImages,
  RENDER_BUCKET,
  SINGLE_LAYOUTS,
  type SingleLayout,
} from "@/lib/social/render";
import { premiumTier, tierCost } from "@/lib/visuals/tiers";
import { imageProviderFor } from "@/lib/visuals";
import { buildVisualPrompt } from "@/lib/visuals/prompt";
import type { CarouselSlide } from "@/lib/social/generate";

// Image rendering for a social post. Template renders (no `premium` in the
// body) are composition only and cost ZERO credits — that stays true forever.
// Premium renders put an AI-generated photo backdrop behind the SAME brand
// overlay (hybrid, never a raw AI image) and cost content credits per
// lib/visuals/tiers.ts, spent atomically BEFORE the provider call and refunded
// if anything after the spend fails (the /api/generate pattern).
// The post is read with the SESSION client (RLS proves it belongs to the
// caller's clinic); only the storage upload uses the service-role client,
// because social-renders has no client write policy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function toDataUri(img: Buffer): string {
  // Providers return png or jpeg; sniff the magic bytes for the MIME.
  const mime =
    img[0] === 0xff && img[1] === 0xd8 ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${img.toString("base64")}`;
}

export async function POST(req: Request) {
  let body: { postId?: string; layout?: string; premium?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const postId = String(body.postId ?? "").trim();
  if (!postId) {
    return NextResponse.json({ error: "Missing postId." }, { status: 400 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { data: gate } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(gate?.role as UserRole | undefined)) {
    return NextResponse.json(
      { error: "This action requires an owner or doctor account." },
      { status: 403 },
    );
  }

  // RLS-scoped read = tenant check. A foreign post simply doesn't exist here.
  const [{ data: post }, { data: clinic }, { data: kit }] = await Promise.all([
    supabase
      .from("social_posts")
      .select("id, clinic_id, format, caption, carousel_slides, campaign_type, topic")
      .eq("id", postId)
      .maybeSingle(),
    supabase.from("clinics").select("business_name, area, city").single(),
    supabase
      .from("clinic_brand_kits")
      .select("logo_path, primary_color, secondary_color, font")
      .maybeSingle(),
  ]);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (!clinic) return NextResponse.json({ error: "No clinic found." }, { status: 400 });

  const layout = (SINGLE_LAYOUTS as readonly string[]).includes(body.layout ?? "")
    ? (body.layout as SingleLayout)
    : undefined;

  // ---- Premium backdrop: resolve tier, check the provider, spend, generate.
  const tier = premiumTier(body.premium);
  let premiumBg: string | undefined;
  let creditsLeft: number | undefined;
  let refund: (() => Promise<void>) | null = null;

  if (tier) {
    const provider = imageProviderFor(tier.id);
    // Key check BEFORE the spend — a misconfigured tier must never charge.
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: `${tier.label} is not available right now — the branded render is free and always works.` },
        { status: 500 },
      );
    }

    const cost = tierCost(tier, post.format);
    const spend = await spendCredits("content", cost, "generation", post.id);
    if (!spend.ok) {
      if ("insufficient" in spend) {
        return NextResponse.json(
          {
            error: `Not enough content credits — a ${tier.label.toLowerCase()} ${post.format === "carousel" ? "carousel" : "image"} needs ${cost}. Upgrade to add more.`,
            upgrade: true,
          },
          { status: 402 },
        );
      }
      return NextResponse.json({ error: spend.error }, { status: 500 });
    }
    creditsLeft = spend.balanceAfter;
    refund = () => refundCredit(spend.ledgerId);

    try {
      const prompt = buildVisualPrompt({
        topic: post.topic ?? headline(post.caption),
        campaignType: post.campaign_type,
        brandColors: { primary: kit?.primary_color ?? "#0D9488" },
      });
      const img = await provider.generate({ prompt, width: 1080, height: 1080 });
      premiumBg = toDataUri(img);
    } catch (err) {
      await refund();
      console.error(`Premium visual (${tier.id}) failed:`, err);
      return NextResponse.json(
        { error: "Could not generate the premium backdrop — nothing was charged. Please try again." },
        { status: 502 },
      );
    }
  }

  try {
    const admin = createAdminClient();
    const paths = await renderPostImages(admin, clinic, kit ?? null, {
      postId: post.id,
      clinicId: post.clinic_id,
      format: post.format === "carousel" ? "carousel" : "single",
      caption: post.caption,
      slides: (post.carousel_slides as CarouselSlide[] | null) ?? null,
      campaignType: post.campaign_type,
      layout,
      premiumBg,
    });

    // premium_visual/premium_tier land with migration 046; retry without them
    // so rendering never breaks mid-rollout (the actions.ts fallback pattern).
    const full = tier
      ? { render_paths: paths, premium_visual: true, premium_tier: tier.id }
      : { render_paths: paths };
    const { error: upErr } = await supabase
      .from("social_posts")
      .update(full)
      .eq("id", post.id);
    if (upErr && tier && (upErr.code === "PGRST204" || /premium_/i.test(upErr.message ?? ""))) {
      await supabase
        .from("social_posts")
        .update({ render_paths: paths })
        .eq("id", post.id);
    }

    // Signed URLs for immediate preview/download (1 hour).
    const { data: signed } = await admin.storage
      .from(RENDER_BUCKET)
      .createSignedUrls(paths, 3600);
    return NextResponse.json({
      paths,
      urls: (signed ?? []).map((s) => s.signedUrl),
      ...(tier ? { creditsLeft, premium: tier.id } : {}),
    });
  } catch (err) {
    // The paid part (if any) already succeeded, but the clinic got no image —
    // refund the reserve so a render/upload hiccup never bills them.
    if (refund) await refund();
    console.error("Social render failed:", err);
    return NextResponse.json(
      { error: "Could not render the image. Please try again." },
      { status: 500 },
    );
  }
}

/** First line of the caption, for the prompt when the post has no topic. */
function headline(caption: string): string {
  return String(caption ?? "").split(/\n/)[0]?.slice(0, 120) ?? "";
}
