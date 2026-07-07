import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HistoryClient, type HistoryRow } from "./history-client";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = createClient();

  const BASE =
    "id, topic, tone_used, generated_copy, schema_markup, status, published_date, created_at, post:post_type_id(name, platform)";

  // citable_mode lands with migration 009; fall back gracefully if it isn't
  // applied yet so /history never breaks.
  const primary = await supabase
    .from("generated_content")
    .select(`${BASE}, citable_mode`)
    .order("created_at", { ascending: false })
    .limit(100);
  const data = primary.error
    ? (
        await supabase
          .from("generated_content")
          .select(BASE)
          .order("created_at", { ascending: false })
          .limit(100)
      ).data
    : primary.data;

  const rows = (data as unknown as HistoryRow[]) ?? [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-primary">
          Content History
        </h1>
        <Link
          href="/generate"
          className="flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
        >
          + New
        </Link>
      </div>

      <div className="mt-6">
        <HistoryClient rows={rows} />
      </div>
    </div>
  );
}
