import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { SOCIAL_CONSENT } from "@/lib/capture/consent";
import {
  composeMomentImages,
  COMPOSE_TEMPLATES,
  COMPOSE_FORMATS,
  type ComposeTemplate,
  type ComposeFormat,
} from "@/lib/capture/compose";
import { RENDER_BUCKET } from "@/lib/social/render";

// S2 composition endpoint — 0 credits (rendering is local composition). The
// moment is read with the SESSION client AND filtered to
// consent_type='review_and_social' IN THE QUERY: a review-only moment does not
// exist for this endpoint, regardless of what the UI sends.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { momentId?: string; template?: string; formats?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const momentId = String(body.momentId ?? "").trim();
  const template = (COMPOSE_TEMPLATES as readonly string[]).includes(body.template ?? "")
    ? (body.template as ComposeTemplate)
    : "result_hero";
  const formats = (body.formats ?? ["feed"]).filter((f): f is ComposeFormat =>
    (COMPOSE_FORMATS as readonly string[]).includes(f),
  );
  if (!momentId || formats.length === 0) {
    return NextResponse.json({ error: "Missing momentId or formats." }, { status: 400 });
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
      { error: "Composing is available to owner or doctor accounts only." },
      { status: 403 },
    );
  }

  // THE consent gate: enforced in the query, not the UI.
  const [{ data: moment }, { data: clinic }, { data: kit }] = await Promise.all([
    supabase
      .from("capture_moments")
      .select("id, clinic_id, treatment, after_photo_path, before_photo_path")
      .eq("id", momentId)
      .eq("consent_type", SOCIAL_CONSENT)
      .maybeSingle(),
    supabase.from("clinics").select("business_name, area, city").single(),
    supabase
      .from("clinic_brand_kits")
      .select("primary_color, secondary_color, font")
      .maybeSingle(),
  ]);
  if (!moment) {
    return NextResponse.json(
      { error: "Moment not found, or the patient's consent doesn't cover social." },
      { status: 404 },
    );
  }
  if (!clinic) return NextResponse.json({ error: "No clinic found." }, { status: 400 });

  try {
    const admin = createAdminClient();
    const paths = await composeMomentImages(admin, clinic, (kit as never) ?? null, {
      momentId: moment.id,
      clinicId: moment.clinic_id,
      template,
      formats,
      afterPhotoPath: moment.after_photo_path,
      beforePhotoPath: moment.before_photo_path,
      treatment: moment.treatment,
    });
    const { data: signed } = await admin.storage
      .from(RENDER_BUCKET)
      .createSignedUrls(paths, 3600);
    return NextResponse.json({
      paths,
      urls: (signed ?? []).map((s) => s.signedUrl).filter(Boolean),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Compose failed.";
    const status = /before/.test(msg) ? 400 : 500;
    if (status === 500) console.error("Moment compose failed:", err);
    return NextResponse.json(
      { error: status === 400 ? msg : "Could not compose the image. Please try again." },
      { status },
    );
  }
}
