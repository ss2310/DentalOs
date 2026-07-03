import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { HistoryClient, type HistoryRow } from "./history-client";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const supabase = createClient();

  const { data } = await supabase
    .from("generated_content")
    .select(
      "id, topic, tone_used, generated_copy, schema_markup, status, published_date, created_at, post:post_type_id(name, platform)",
    )
    .order("created_at", { ascending: false })
    .limit(100);

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
