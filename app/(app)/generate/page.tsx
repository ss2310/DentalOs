import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { GenerateClient } from "./generate-client";
import type { PostType } from "@/lib/generate";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  await requireAdmin();
  const supabase = createClient();

  // 'Internal' types (e.g. Insight Report) are generated from their own feature
  // pages, not the Content Studio — keep them out of this grid.
  const BASE = "id, name, platform, credits_cost, schema_template, extra_fields";

  // topic_bank + the topic_suggestions table arrive with migration 012; degrade
  // gracefully (no dropdown, just free-text) if they aren't applied yet.
  const primary = await supabase
    .from("post_types")
    .select(`${BASE}, topic_bank`)
    .neq("platform", "Internal")
    .order("name", { ascending: true });
  const types = primary.error
    ? (
        await supabase
          .from("post_types")
          .select(BASE)
          .neq("platform", "Internal")
          .order("name", { ascending: true })
      ).data
    : primary.data;

  const [{ data: clinic }, suggestions, cards] = await Promise.all([
    supabase.from("clinics").select("content_credits_balance").single(),
    // RLS returns curated (clinic_id NULL) + this clinic's own suggestions.
    supabase
      .from("topic_suggestions")
      .select("bank, label")
      .eq("is_active", true)
      .order("bank", { ascending: true })
      .order("sort_order", { ascending: true }),
    // Service/Geo pages prefer the clinic's real treatment names for the picker.
    supabase
      .from("rate_cards")
      .select("treatment_name")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
  ]);

  const postTypes = (types as unknown as PostType[]) ?? [];
  const remaining = clinic?.content_credits_balance ?? 0;

  // Group suggestion labels by bank (in sort_order) for the client dropdown.
  const topicBanks: Record<string, string[]> = {};
  for (const row of (suggestions.data as { bank: string; label: string }[] | null) ??
    []) {
    (topicBanks[row.bank] ??= []).push(row.label);
  }

  const rateCards = (
    (cards.data as { treatment_name: string }[] | null) ?? []
  )
    .map((r) => r.treatment_name)
    .filter(Boolean);

  return (
    <GenerateClient
      postTypes={postTypes}
      remaining={remaining}
      topicBanks={topicBanks}
      rateCards={rateCards}
    />
  );
}
