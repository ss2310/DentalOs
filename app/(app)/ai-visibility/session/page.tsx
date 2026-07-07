import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { ENGINE_KEYS, type AiQueryRow } from "@/lib/ai-visibility";
import { SessionStepper, type Combo } from "../session-stepper";

export const dynamic = "force-dynamic";

export default async function CheckSessionPage() {
  await requireAdmin();
  const supabase = createClient();
  const { data } = await supabase
    .from("ai_visibility_queries")
    .select("id, query_text, query_layer, is_active, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const active = (data as AiQueryRow[]) ?? [];
  if (active.length === 0) redirect("/ai-visibility");

  const combos: Combo[] = active.flatMap((q) =>
    ENGINE_KEYS.map((engine) => ({
      query_id: q.id,
      query_text: q.query_text,
      engine,
    })),
  );

  return (
    <SessionStepper
      combos={combos}
      mode="clinic"
      backHref="/ai-visibility"
      backLabel="Back to AI Visibility"
    />
  );
}
