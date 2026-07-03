"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { landingPageLimit, planLabel } from "@/lib/plans";
import {
  slugify,
  parseMeta,
  copyToHtml,
  buildLandingPageHtml,
} from "@/lib/landing-html";

// Publishing is a deterministic server-side HTML transform (no AI call), but per
// product decision it costs 1 credit and is bounded by a per-plan page cap.
const PUBLISH_COST = 1;

export type PublishState = {
  path?: string; // "/p/<booking_slug>/<slug>" — client prepends the origin
  creditsLeft?: number;
  error?: string;
};

/** First free "<base>", "<base>-2", … not already taken (checker returns true if taken). */
async function uniqueSlug(
  base: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const root = base || "page";
  if (!(await isTaken(root))) return root;
  for (let i = 2; i < 50; i++) {
    const candidate = `${root}-${i}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Extremely unlikely; fall back to a timestamped suffix on the caller side.
  return `${root}-${Date.now().toString(36)}`;
}

/**
 * Wraps a generated Geo Landing Page's copy + JSON-LD into a complete hosted
 * HTML document and stores it published in landing_pages. Charges 1 credit
 * (blocks at 0) and enforces the clinic's plan page cap. Auto-assigns the
 * clinic a public booking_slug on first publish if it doesn't have one.
 */
export async function publishLandingPage(input: {
  content: string;
  schema: string | null;
  targetArea: string;
  slug: string;
}): Promise<PublishState> {
  const content = (input.content ?? "").trim();
  if (!content) return { error: "Nothing to publish — generate a page first." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isAdminRole(await getUserRole()))
    return { error: "Only an owner or doctor can publish hosted pages." };

  const { data: clinic } = await supabase
    .from("clinics")
    .select(
      "id, business_name, phone, address, city, area, booking_slug, monthly_credits, credits_used",
    )
    .single();
  if (!clinic) return { error: "No clinic found for this account." };

  // `plan` arrives with migration 011; degrade to the default tier if it isn't
  // applied yet so publishing never hard-breaks on a missing column.
  let plan = "starter";
  const planRes = await supabase
    .from("clinics")
    .select("plan")
    .eq("id", clinic.id)
    .maybeSingle();
  if (!planRes.error && planRes.data?.plan) plan = planRes.data.plan as string;

  // Credits — block at 0 (same pattern as /api/generate).
  const remaining = (clinic.monthly_credits ?? 0) - (clinic.credits_used ?? 0);
  if (remaining < PUBLISH_COST) {
    return {
      error: `Not enough credits — publishing needs ${PUBLISH_COST}, you have ${remaining} left this month.`,
    };
  }

  // Plan cap — count this clinic's existing pages (RLS-scoped) before inserting.
  const { count } = await supabase
    .from("landing_pages")
    .select("id", { count: "exact", head: true });
  const limit = landingPageLimit(plan);
  if ((count ?? 0) >= limit) {
    return {
      error: `You've hit your ${planLabel(plan)} plan limit of ${limit} hosted page${
        limit === 1 ? "" : "s"
      }. Delete one in Settings → Landing Pages, or upgrade.`,
    };
  }

  // Ensure the clinic has a public booking_slug (the /p/<booking_slug>/… prefix).
  // Generated once from the business name and reused for all future pages.
  let bookingSlug = clinic.booking_slug;
  if (!bookingSlug) {
    bookingSlug = await uniqueSlug(slugify(clinic.business_name ?? "clinic"), async (c) => {
      const { data } = await supabase
        .from("clinics")
        .select("id")
        .eq("booking_slug", c)
        .maybeSingle();
      return !!data;
    });
    const { error: slugErr } = await supabase
      .from("clinics")
      .update({ booking_slug: bookingSlug })
      .eq("id", clinic.id);
    if (slugErr) return { error: "Could not set up your public URL. Please try again." };
  }

  // Page slug — unique within this clinic. Auto-suffix on collision.
  const pageSlug = await uniqueSlug(
    slugify(input.slug || input.targetArea || "landing"),
    async (c) => {
      const { data } = await supabase
        .from("landing_pages")
        .select("id")
        .eq("clinic_id", clinic.id)
        .eq("slug", c)
        .maybeSingle();
      return !!data;
    },
  );

  // Build the standalone document. META TITLE from the copy is used when
  // present (all Website types emit one); this is only the fallback.
  const fallbackTitle = (
    input.targetArea
      ? `${input.targetArea} | ${clinic.business_name ?? "Our Clinic"}`
      : (clinic.business_name ?? "Landing page")
  ).trim();
  const meta = parseMeta(content, fallbackTitle);
  const html = buildLandingPageHtml({
    title: meta.title,
    metaDescription: meta.description,
    bodyHtml: copyToHtml(meta.body),
    schemaJsonLd: input.schema,
    clinic: {
      business_name: clinic.business_name,
      phone: clinic.phone,
      address: clinic.address,
      city: clinic.city,
      area: clinic.area,
      booking_slug: bookingSlug,
    },
  });

  const { error: insertErr } = await supabase.from("landing_pages").insert({
    clinic_id: clinic.id,
    slug: pageSlug,
    target_area: input.targetArea || null,
    title: meta.title,
    meta_description: meta.description,
    html_content: html,
    schema_jsonld: input.schema,
    status: "published",
    published_at: new Date().toISOString(),
  });
  if (insertErr) {
    console.error("Failed to publish landing page:", insertErr);
    return { error: "Could not publish the page. Please try again." };
  }

  // Charge the credit only after a successful publish.
  const newUsed = (clinic.credits_used ?? 0) + PUBLISH_COST;
  const { error: creditErr } = await supabase
    .from("clinics")
    .update({ credits_used: newUsed })
    .eq("id", clinic.id);
  if (creditErr) console.error("Failed to deduct credits:", creditErr);
  const creditsLeft = (clinic.monthly_credits ?? 0) - newUsed;

  revalidatePath("/settings");
  return { path: `/p/${bookingSlug}/${pageSlug}`, creditsLeft };
}
