import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { RENDER_BUCKET } from "@/lib/social/render";
import { waNumber } from "@/lib/whatsapp";
import { PageHeader } from "@/components/page";
import { PublishClient } from "./publish-client";

// MANUAL PUBLISH screen: copy caption → download image(s) → open the platform
// → mark as posted. No publishing APIs anywhere — the clinic posts by hand.
export const dynamic = "force-dynamic";

export default async function PublishPage({ params }: { params: { id: string } }) {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");
  const supabase = createClient();

  const COLS =
    "id, platform, format, caption, hashtags, gbp_post_type, status, render_paths, posted_at";
  // premium_tier lands with migration 046; re-query without it if unapplied.
  const [postRes, { data: clinic }] = await Promise.all([
    supabase
      .from("social_posts")
      .select(`${COLS}, premium_tier`)
      .eq("id", params.id)
      .maybeSingle(),
    supabase.from("clinics").select("phone").single(),
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
  if (post.status !== "approved" && post.status !== "posted_manually") {
    redirect(`/social/review/${post.id}`);
  }

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
        title={post.status === "posted_manually" ? "Posted" : "Post it now"}
        subtitle={
          post.status === "posted_manually"
            ? "This one is done — here it is for reference."
            : "Three steps: copy the caption, save the image, post it on the app."
        }
      />
      <PublishClient
        post={{
          id: post.id,
          platform: post.platform,
          format: post.format,
          caption: post.caption,
          hashtags: post.hashtags ?? [],
          status: post.status,
          postedAt: post.posted_at,
          premiumTier:
            (post as { premium_tier?: string | null }).premium_tier ?? null,
        }}
        renderUrls={renderUrls}
        waSelfNumber={clinic?.phone ? waNumber(clinic.phone) : null}
      />
    </div>
  );
}
