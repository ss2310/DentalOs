import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { renderPostImages, RENDER_BUCKET } from "@/lib/social/render";
import { sniffImageMime } from "@/lib/visuals/generate";
import type { CarouselSlide } from "@/lib/social/generate";

// Upload-your-own-photo → a well-designed branded post image. The clinic's own
// photo (doctor, team, clinic interior, or a consented patient/proof shot) is
// composed through the SAME overlay engine as the AI backdrop (renderPostImages
// premiumBg), so it lands looking designed, not raw. Composition only → ZERO
// credits, exactly like the free branded render and Moment Capture.
//
// CONSENT GATE (the one hard rule): a photo the clinic marks as a patient /
// treatment-result image cannot be composed unless `consent` is also set — the
// clinic attests they hold the patient's written consent. Non-patient photos
// skip it. This mirrors the Moment Capture posture (real people/proof photos are
// never used without consent) while keeping everything in one flow.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
// satori/resvg decode png + jpeg data URIs reliably; webp is rejected here.
const OK_TYPES = new Set(["image/png", "image/jpeg"]);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  }

  const postId = String(form.get("postId") ?? "").trim();
  const file = form.get("file");
  const isPatient = String(form.get("isPatient") ?? "") === "1";
  const consent = String(form.get("consent") ?? "") === "1";
  if (!postId) return NextResponse.json({ error: "Missing postId." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Photo must be under 8 MB." }, { status: 400 });
  }
  if (!OK_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Upload a PNG or JPG image." }, { status: 400 });
  }
  // The consent gate — a patient/proof photo needs the attestation ticked.
  if (isPatient && !consent) {
    return NextResponse.json(
      {
        error:
          "To use a patient or before/after photo, confirm you have the patient's written consent.",
      },
      { status: 422 },
    );
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
      .select("id, clinic_id, format, caption, carousel_slides")
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

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    // Never trust the declared MIME — sniff the magic bytes. A spoofed file
    // gets a clear rejection here instead of a downstream renderer 500, and the
    // data URI carries the REAL type so satori/resvg decode reliably.
    const realMime = sniffImageMime(buf);
    if (!realMime) {
      return NextResponse.json(
        { error: "That file isn't a valid PNG or JPG photo — please re-export it and try again." },
        { status: 400 },
      );
    }
    const dataUri = `data:${realMime};base64,${buf.toString("base64")}`;

    const admin = createAdminClient();
    // premiumBg = the uploaded photo → composed under the brand overlay (logo,
    // headline, footer) exactly like the AI-backdrop path.
    const paths = await renderPostImages(admin, clinic, kit ?? null, {
      postId: post.id,
      clinicId: post.clinic_id,
      format: post.format === "carousel" ? "carousel" : "single",
      caption: post.caption,
      slides: (post.carousel_slides as CarouselSlide[] | null) ?? null,
      premiumBg: dataUri,
    });

    // An uploaded real photo is neither a template nor an AI image — clear the
    // premium markers. Retry without them if the columns aren't there yet.
    const { error: upErr } = await supabase
      .from("social_posts")
      .update({ render_paths: paths, premium_visual: false, premium_tier: null })
      .eq("id", post.id);
    if (upErr && (upErr.code === "PGRST204" || /premium_/i.test(upErr.message ?? ""))) {
      await supabase
        .from("social_posts")
        .update({ render_paths: paths })
        .eq("id", post.id);
    }

    const { data: signed } = await admin.storage
      .from(RENDER_BUCKET)
      .createSignedUrls(paths, 3600);
    return NextResponse.json({
      paths,
      urls: (signed ?? []).map((s) => s.signedUrl),
    });
  } catch (err) {
    console.error("Social photo upload failed:", err);
    return NextResponse.json(
      { error: "Could not use that photo. Please try a different image." },
      { status: 500 },
    );
  }
}
