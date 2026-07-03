import { createClient } from "@/lib/supabase/server";
import { GenerateClient } from "./generate-client";
import type { PostType } from "@/lib/generate";

export const dynamic = "force-dynamic";

export default async function GeneratePage() {
  const supabase = createClient();

  const [{ data: types }, { data: clinic }] = await Promise.all([
    supabase
      .from("post_types")
      .select("id, name, platform, credits_cost, schema_template, extra_fields")
      // 'Internal' types (e.g. Insight Report) are generated from their own
      // feature pages, not the Content Studio — keep them out of this grid.
      .neq("platform", "Internal")
      .order("name", { ascending: true }),
    supabase.from("clinics").select("monthly_credits, credits_used").single(),
  ]);

  const postTypes = (types as unknown as PostType[]) ?? [];
  const remaining =
    (clinic?.monthly_credits ?? 0) - (clinic?.credits_used ?? 0);

  return <GenerateClient postTypes={postTypes} remaining={remaining} />;
}
