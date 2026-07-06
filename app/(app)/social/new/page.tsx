import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { resolveForVertical, DEFAULT_VERTICAL } from "@/lib/vertical";
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

  const [{ data: topics }, { data: recent }] = await Promise.all([
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
