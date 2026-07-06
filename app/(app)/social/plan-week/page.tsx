import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { resolveForVertical, DEFAULT_VERTICAL } from "@/lib/vertical";
import { PageHeader } from "@/components/page";
import { PlanWeekClient } from "./plan-client";

// Weekly planning flow: 3 questions → 5 posts across platforms land in the
// approval queue as one batch. Each post is its own generation (5 credits).
export const dynamic = "force-dynamic";

export default async function PlanWeekPage() {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");
  const supabase = createClient();

  const { data: clinic } = await supabase.from("clinics").select("vertical").single();
  const vertical = clinic?.vertical ?? DEFAULT_VERTICAL;

  const { data: topics } = await supabase
    .from("topic_suggestions")
    .select("bank, label, vertical, sort_order")
    .in("bank", ["social", "occasion"])
    .eq("is_active", true)
    .is("clinic_id", null)
    .order("sort_order");
  const resolved = resolveForVertical(
    (topics ?? []) as { bank: string; label: string; vertical?: string | null }[],
    vertical,
    (t) => `${t.bank}:${t.label}`,
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Plan my week"
        subtitle="Answer 3 quick questions — get 5 posts to approve."
      />
      <PlanWeekClient
        focusIdeas={resolved.filter((t) => t.bank === "social").map((t) => t.label).slice(0, 6)}
        seasonalTopics={resolved.filter((t) => t.bank === "occasion").map((t) => t.label).slice(0, 6)}
      />
    </div>
  );
}
