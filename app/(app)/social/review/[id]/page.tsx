import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { RENDER_BUCKET } from "@/lib/social/render";
import { PageHeader } from "@/components/page";
import { ReviewClient } from "./review-client";

// Approval screen for ONE variant: preview exactly as the platform shows it,
// then approve / edit (re-runs YMYL) / reject. No bulk approve — per variant,
// by design.
export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: { id: string } }) {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");
  const supabase = createClient();

  const COLS =
    "id, platform, format, caption, hashtags, carousel_slides, gbp_post_type, soft_warnings, ymyl_flags, status, scheduled_date, topic, render_paths";
  // premium_tier lands with migration 046; re-query without it if unapplied.
  const [postRes, { data: clinic }] = await Promise.all([
    supabase
      .from("social_posts")
      .select(`${COLS}, premium_tier`)
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("clinics").select("business_name, area, city").single(),
  ]);
  const post = postRes.error
    ? (
        await supabase
          .from("social_posts")
          .select(COLS)
          .eq("id", params.id)
          .maybeSingle()
      ).data
    : postRes.data;
  if (!post) notFound();

  // Signed preview URLs for any existing renders (session client — RLS select).
  let renderUrls: string[] = [];
  if ((post.render_paths ?? []).length > 0) {
    const { data: signed } = await supabase.storage
      .from(RENDER_BUCKET)
      .createSignedUrls(post.render_paths, 3600);
    renderUrls = (signed ?? [])
      .map((s) => s.signedUrl)
      .filter((u): u is string => !!u);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Review post"
        subtitle="Approve it, fix it, or reject it — nothing goes out without you."
      />
      <ReviewClient
        post={{
          id: post.id,
          platform: post.platform,
          format: post.format,
          caption: post.caption,
          hashtags: post.hashtags ?? [],
          slides: post.carousel_slides ?? null,
          gbpPostType: post.gbp_post_type,
          softWarnings: post.soft_warnings ?? [],
          ymylFlags:
            (post.ymyl_flags as { violations?: string[] } | null)?.violations ?? null,
          status: post.status,
          scheduledDate: post.scheduled_date,
          topic: post.topic,
          premiumTier:
            (post as { premium_tier?: string | null }).premium_tier ?? null,
        }}
        clinicName={clinic?.business_name ?? "Your clinic"}
        renderUrls={renderUrls}
      />
    </div>
  );
}
