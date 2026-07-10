import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminRole, type UserRole } from "@/lib/roles";
import { spendCredits, refundCredit } from "@/lib/credits";
import { RENDER_BUCKET } from "@/lib/social/render";
import { tierCost } from "@/lib/visuals/tiers";
import {
  validateImageRequest,
  runImageProvider,
  sniffImageMime,
} from "@/lib/visuals/generate";

// Content Studio image generation — a relevant hero image for an article / page.
// Produces a CLEAN standalone photo (no text baked in) from the piece's subject
// or the writer's own `describe` text, via the shared safe-image core. Same rails
// as /api/generate: owner/doctor only, ATOMIC credit spend BEFORE the paid call
// (refunded on failure), server-side key only, no-people/no-clinical safety.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { subject?: string; describe?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const subject = String(body.subject ?? "").trim().slice(0, 300);
  const describe = String(body.describe ?? "").trim().slice(0, 300);
  if (!subject && !describe) {
    return NextResponse.json(
      { error: "Add a topic or describe the image first." },
      { status: 400 },
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
      { error: "Content generation is available to owner or doctor accounts only." },
      { status: 403 },
    );
  }

  const [{ data: clinic }, { data: kit }] = await Promise.all([
    supabase.from("clinics").select("id, content_credits_balance").single(),
    supabase.from("clinic_brand_kits").select("primary_color").maybeSingle(),
  ]);
  if (!clinic) {
    return NextResponse.json({ error: "No clinic found for this account." }, { status: 400 });
  }

  // Pre-spend: resolve the tier + check the key. Wording is never blocked.
  const v = validateImageRequest({ tierId: body.model });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });

  const cost = tierCost(v.tier, "single");
  const spend = await spendCredits("content", cost, "generation");
  if (!spend.ok) {
    if ("insufficient" in spend) {
      return NextResponse.json(
        {
          error: `Not enough content credits — a ${v.tier.label.toLowerCase()} image needs ${cost}, you have ${Math.max(clinic.content_credits_balance ?? 0, 0)} left. Upgrade to add more.`,
          upgrade: true,
        },
        { status: 402 },
      );
    }
    return NextResponse.json({ error: spend.error }, { status: 500 });
  }
  const creditsLeft = spend.balanceAfter;

  try {
    const img = await runImageProvider({
      provider: v.provider,
      subject,
      describe,
      mode: "standalone",
      brandPrimary: kit?.primary_color ?? "#0D9488",
    });

    const admin = createAdminClient();
    // Providers return png OR jpeg regardless of the ask — sniff the real type.
    const mime = sniffImageMime(img) ?? "image/png";
    let path = `content/${clinic.id}/${randomUUID()}.${mime === "image/jpeg" ? "jpg" : "png"}`;
    let { error: upErr } = await admin.storage
      .from(RENDER_BUCKET)
      .upload(path, img, { contentType: mime, upsert: true });
    if (upErr && mime === "image/jpeg") {
      // Pre-051 bucket allows only image/png — legacy fallback (browsers sniff
      // the real bytes) so a mid-rollout deploy never breaks the paid path.
      path = `content/${clinic.id}/${randomUUID()}.png`;
      ({ error: upErr } = await admin.storage
        .from(RENDER_BUCKET)
        .upload(path, img, { contentType: "image/png", upsert: true }));
    }
    if (upErr) throw new Error(`Image upload failed: ${upErr.message}`);

    const { data: signed } = await admin.storage
      .from(RENDER_BUCKET)
      .createSignedUrls([path], 3600);
    return NextResponse.json({
      path,
      url: signed?.[0]?.signedUrl ?? null,
      creditsLeft,
      model: v.tier.id,
    });
  } catch (err) {
    await refundCredit(spend.ledgerId);
    console.error("Content Studio image failed:", err);
    return NextResponse.json(
      { error: "Could not generate the image — nothing was charged. Please try again." },
      { status: 502 },
    );
  }
}
