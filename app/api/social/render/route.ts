import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, type UserRole } from "@/lib/roles";
import {
  renderPostImages,
  RENDER_BUCKET,
  SINGLE_LAYOUTS,
  type SingleLayout,
} from "@/lib/social/render";
import type { CarouselSlide } from "@/lib/social/generate";

// Template image rendering for a social post — composition only, ZERO credits.
// The post is read with the SESSION client (RLS proves it belongs to the
// caller's clinic); only the storage upload uses the service-role client,
// because social-renders has no client write policy.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { postId?: string; layout?: string };
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
      .select("id, clinic_id, format, caption, carousel_slides, campaign_type")
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
    });

    await supabase.from("social_posts").update({ render_paths: paths }).eq("id", post.id);

    // Signed URLs for immediate preview/download (1 hour).
    const { data: signed } = await admin.storage
      .from(RENDER_BUCKET)
      .createSignedUrls(paths, 3600);
    return NextResponse.json({
      paths,
      urls: (signed ?? []).map((s) => s.signedUrl),
    });
  } catch (err) {
    console.error("Social render failed:", err);
    return NextResponse.json(
      { error: "Could not render the image. Please try again." },
      { status: 500 },
    );
  }
}
