import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { SOCIAL_CONSENT } from "@/lib/capture/consent";
import { PageHeader, EmptyState, SectionHeader } from "@/components/page";
import { formatDate } from "@/lib/format";
import { GalleryCard } from "./gallery-card";

// The clinic's proof library: every consented moment, its consent class, and —
// when a moment was composed into a social post — that post's live status.
// Signed URLs only (private bucket); 1-hour expiry per page render.
export const dynamic = "force-dynamic";

const CAPTURE_BUCKET = "capture-photos";

export default async function CaptureGalleryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const canCompose = isAdminRole(await getUserRole());

  const { data: moments } = await supabase
    .from("capture_moments")
    .select(
      "id, treatment, after_photo_path, before_photo_path, consent_type, consent_review, review_request_sent_at, created_at, patients(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(60);
  const list = moments ?? [];

  // Post status for moments used in social (RLS-scoped join).
  const ids = list.map((m) => m.id as string);
  const { data: posts } = ids.length
    ? await supabase
        .from("social_posts")
        .select("source_moment_id, status, platform")
        .in("source_moment_id", ids)
    : { data: [] };
  const postsByMoment = new Map<string, { status: string; platform: string }[]>();
  for (const p of (posts ?? []) as { source_moment_id: string; status: string; platform: string }[]) {
    postsByMoment.set(p.source_moment_id, [
      ...(postsByMoment.get(p.source_moment_id) ?? []),
      { status: p.status, platform: p.platform },
    ]);
  }

  // Signed thumbnails (after photo per card).
  const paths = list.map((m) => m.after_photo_path as string);
  const { data: signed } = paths.length
    ? await supabase.storage.from(CAPTURE_BUCKET).createSignedUrls(paths, 3600)
    : { data: [] };
  const urlByPath = new Map(
    (signed ?? []).map((s) => [s.path as string, s.signedUrl as string]),
  );

  return (
    <div>
      <PageHeader
        title="Moments gallery"
        subtitle="Your proof library — every photo here has a recorded consent."
        action={
          <Link
            href="/capture"
            className="flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
          >
            + Capture
          </Link>
        }
      />

      {list.length === 0 ? (
        <div className="mt-8">
          <EmptyState>
            No moments yet. After a great result,{" "}
            <Link href="/capture" className="font-medium text-primary">
              capture it
            </Link>{" "}
            — with the patient&apos;s consent — and build your proof library.
          </EmptyState>
        </div>
      ) : (
        <>
          <SectionHeader hint="Newest first">
            {list.length} moment{list.length === 1 ? "" : "s"}
          </SectionHeader>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.map((m) => (
              <GalleryCard
                key={m.id as string}
                moment={{
                  id: m.id as string,
                  patientName:
                    ((m.patients as { full_name?: string } | null)?.full_name as string) ??
                    "Patient",
                  treatment: (m.treatment as string) ?? null,
                  thumbUrl: urlByPath.get(m.after_photo_path as string) ?? null,
                  hasBefore: !!m.before_photo_path,
                  consentType: m.consent_type as string,
                  reviewAsked: !!m.review_request_sent_at,
                  createdLabel: formatDate((m.created_at as string).slice(0, 10)),
                  posts: postsByMoment.get(m.id as string) ?? [],
                  // The compose door: query-derived consent + role. The server
                  // gate in the composer re-checks BOTH.
                  canCompose: canCompose && m.consent_type === SOCIAL_CONSENT,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
