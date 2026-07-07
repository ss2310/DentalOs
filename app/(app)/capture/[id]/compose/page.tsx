import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { SOCIAL_CONSENT } from "@/lib/capture/consent";
import { CAPTURE_BUCKET } from "@/lib/capture/compose";
import { PageHeader } from "@/components/page";
import { ComposeClient } from "./compose-client";

// S2 composer screen — reachable ONLY for consent_type='review_and_social'
// (the query below returns nothing otherwise; a review_only moment 404s here
// no matter what URL is crafted).
export const dynamic = "force-dynamic";

export default async function ComposePage({ params }: { params: { id: string } }) {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");
  const supabase = createClient();

  const { data: moment } = await supabase
    .from("capture_moments")
    .select(
      "id, treatment, after_photo_path, before_photo_path, created_at, patients(full_name)",
    )
    .eq("id", params.id)
    .eq("consent_type", SOCIAL_CONSENT)
    .maybeSingle();
  if (!moment) notFound();

  // Signed previews of the raw photos for the template picker.
  const photoPaths = [moment.after_photo_path, moment.before_photo_path].filter(
    (p): p is string => !!p,
  );
  const { data: signed } = await supabase.storage
    .from(CAPTURE_BUCKET)
    .createSignedUrls(photoPaths, 3600);
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Compose the post"
        subtitle='Real photo, branded frame, and the "shared with consent" line baked in.'
      />
      <ComposeClient
        moment={{
          id: moment.id as string,
          treatment: (moment.treatment as string) ?? null,
          hasBefore: !!moment.before_photo_path,
          afterUrl: urlByPath.get(moment.after_photo_path as string) ?? null,
          beforeUrl: moment.before_photo_path
            ? (urlByPath.get(moment.before_photo_path as string) ?? null)
            : null,
        }}
      />
    </div>
  );
}
