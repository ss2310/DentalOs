import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { resolveForVertical, DEFAULT_VERTICAL } from "@/lib/vertical";
import { SOCIAL_CONSENT } from "@/lib/capture/consent";
import { PageHeader } from "@/components/page";
import { NewPostClient } from "./new-client";

// Single-post generation. Topic sources: type your own, pick a seasonal/social
// suggestion (topic_suggestions via the vertical resolver), or repurpose an
// existing Content Studio piece.
export const dynamic = "force-dynamic";

export default async function NewSocialPostPage() {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");
  const supabase = createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, vertical")
    .single();
  if (!clinic) redirect("/dashboard");
  const vertical = clinic.vertical ?? DEFAULT_VERTICAL;

  // "Use a captured moment": ONLY consent_type='review_and_social' moments are
  // queried — a review_only moment never reaches this page's props at all.
  const [{ data: topics }, { data: recent }, { data: moments }] = await Promise.all([
    supabase
      .from("topic_suggestions")
      .select("bank, label, vertical, sort_order")
      .in("bank", ["social", "occasion"])
      .eq("is_active", true)
      .is("clinic_id", null)
      .order("sort_order"),
    supabase
      .from("generated_content")
      .select("id, topic, created_at, post_types(name)")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("capture_moments")
      .select("id, treatment, created_at, patients(full_name)")
      .eq("consent_type", SOCIAL_CONSENT)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const resolved = resolveForVertical(
    (topics ?? []) as { bank: string; label: string; vertical?: string | null }[],
    vertical,
    (t) => `${t.bank}:${t.label}`,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="New social post"
        subtitle="One topic, every platform — 1 credit per post, images free."
      />
      {(moments ?? []).length > 0 ? (
        <div className="mt-5 rounded-card border border-border bg-white p-4 shadow-card">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Use a captured moment
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Real patient photos (consented for social) — composed with the
            &quot;shared with consent&quot; frame.
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {(moments ?? []).map((m) => (
              <Link
                key={m.id as string}
                href={`/capture/${m.id}/compose`}
                className="flex min-h-[44px] items-center justify-between rounded-button border border-border px-4 text-[15px] hover:border-primary/40"
              >
                <span>
                  {((m.patients as { full_name?: string } | null)?.full_name as string) ??
                    "Patient"}
                  {m.treatment ? ` — ${m.treatment}` : ""}
                </span>
                <span className="text-sm font-medium text-primary">Compose →</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <NewPostClient
        suggestions={{
          social: resolved.filter((t) => t.bank === "social").map((t) => t.label).slice(0, 8),
          seasonal: resolved.filter((t) => t.bank === "occasion").map((t) => t.label).slice(0, 8),
        }}
        repurpose={(recent ?? []).map((r) => ({
          id: r.id as string,
          label: `${(r.post_types as { name?: string } | null)?.name ?? "Content"}: ${r.topic ?? "untitled"}`,
        }))}
      />
    </div>
  );
}
