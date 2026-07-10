import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { spendCredits, refundCredit } from "@/lib/credits";
import { renderPostImages, RENDER_BUCKET } from "@/lib/social/render";
import { tierCost } from "@/lib/visuals/tiers";
import { validateImageRequest, runImageProvider } from "@/lib/visuals/generate";
import type { CarouselSlide } from "@/lib/social/generate";

// Image rendering for a social post. Three outcomes:
//   * Free branded render (no `premium`): a clean logo + text card, composition
//     only, ZERO credits — that stays true forever.
//   * Premium single: a CLEAN AI image (no brand overlay), generated from the
//     post context or the caller's `describe` text, stored as-is. Charged per
//     lib/visuals/tiers.ts.
//   * Premium carousel: the AI image is used as a BACKDROP under the per-slide
//     brand overlay (a carousel needs text on each slide).
// Credits are spent atomically BEFORE the provider call and refunded if anything
// after the spend fails (the /api/generate pattern). The post is read with the
// SESSION client (RLS proves ownership); only storage writes use the admin client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function toDataUri(img: Buffer): string {
  // Providers return png or jpeg; sniff the magic bytes for the MIME.
  const mime = img[0] === 0xff && img[1] === 0xd8 ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${img.toString("base64")}`;
}

export async function POST(req: Request) {
  let body: {
    postId?: string;
    premium?: string;
    describe?: string;
    overlay?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const postId = String(body.postId ?? "").trim();
  if (!postId) {
    return NextResponse.json({ error: "Missing postId." }, { status: 400 });
  }
  const describe = String(body.describe ?? "").trim().slice(0, 300);

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
      .select("id, clinic_id, format, caption, carousel_slides, topic")
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

  const isCarousel = post.format === "carousel";
  // Greeting-poster mode: a single AI photo that KEEPS the brand overlay (logo +
  // headline + footer) instead of being clean. Carousels always overlay.
  const useOverlay = isCarousel || body.overlay === true;

  // ---- Premium AI image: validate (pre-spend), spend, generate.
  const premiumId = String(body.premium ?? "").trim();
  let premiumBg: string | undefined; // carousel: AI backdrop under the overlay
  let rawPaths: string[] | null = null; // single: clean AI image, stored as-is
  let tierId: string | undefined;
  let creditsLeft: number | undefined;
  let refund: (() => Promise<void>) | null = null;

  if (premiumId) {
    // Pre-spend: resolves the tier and checks the provider is configured — a
    // misconfigured request never charges. Wording is never blocked (safety is
    // enforced in the prompt, not by rejecting the customer's text).
    const v = validateImageRequest({ tierId: premiumId });
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
    tierId = v.tier.id;

    const cost = tierCost(v.tier, post.format);
    const spend = await spendCredits("content", cost, "generation", post.id);
    if (!spend.ok) {
      if ("insufficient" in spend) {
        return NextResponse.json(
          {
            error: `Not enough content credits — a ${v.tier.label.toLowerCase()} ${isCarousel ? "carousel" : "image"} needs ${cost}. Upgrade to add more.`,
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
      const img = await runImageProvider({
        provider: v.provider,
        subject: post.topic ?? headline(post.caption),
        describe,
        // Overlay modes (carousel / greeting poster) leave room for the text on
        // top; a clean single image is finished as-is.
        mode: useOverlay ? "backdrop" : "standalone",
        brandPrimary: kit?.primary_color ?? "#0D9488",
      });
      if (useOverlay) {
        premiumBg = toDataUri(img);
      } else {
        // Clean single image — store the raw AI PNG directly (no overlay).
        const admin = createAdminClient();
        const p = `${post.clinic_id}/${post.id}/1.png`;
        const { error } = await admin.storage
          .from(RENDER_BUCKET)
          .upload(p, img, { contentType: "image/png", upsert: true });
        if (error) throw new Error(`Render upload failed: ${error.message}`);
        rawPaths = [p];
      }
    } catch (err) {
      await refund();
      console.error(`Premium visual (${tierId}) failed:`, err);
      return NextResponse.json(
        { error: "Could not generate the image — nothing was charged. Please try again." },
        { status: 502 },
      );
    }
  }

  try {
    const admin = createAdminClient();
    // Clean single AI image is already uploaded; otherwise compose (free branded
    // card, or the carousel with an optional AI backdrop).
    const paths =
      rawPaths ??
      (await renderPostImages(admin, clinic, kit ?? null, {
        postId: post.id,
        clinicId: post.clinic_id,
        format: isCarousel ? "carousel" : "single",
        caption: post.caption,
        slides: (post.carousel_slides as CarouselSlide[] | null) ?? null,
        premiumBg,
      }));

    // premium_visual/premium_tier land with migration 046; retry without them
    // so rendering never breaks mid-rollout (the actions.ts fallback pattern).
    const full = tierId
      ? { render_paths: paths, premium_visual: true, premium_tier: tierId }
      : { render_paths: paths };
    const { error: upErr } = await supabase
      .from("social_posts")
      .update(full)
      .eq("id", post.id);
    if (upErr && tierId && (upErr.code === "PGRST204" || /premium_/i.test(upErr.message ?? ""))) {
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
      ...(tierId ? { creditsLeft, premium: tierId } : {}),
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
