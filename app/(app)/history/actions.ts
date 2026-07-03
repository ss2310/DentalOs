"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIST } from "@/lib/format";

export type HistoryActionState = { ok?: boolean; error?: string };

/** Mark a draft/scheduled item as published (sets published_date to today). */
export async function markPublished(id: string): Promise<HistoryActionState> {
  const supabase = createClient();
  const { error } = await supabase
    .from("generated_content")
    .update({ status: "published", published_date: nowIST().date })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/history");
  return { ok: true };
}

/** Permanently delete a generated item (RLS scopes this to the clinic). */
export async function deleteContent(id: string): Promise<HistoryActionState> {
  const supabase = createClient();
  const { error } = await supabase
    .from("generated_content")
    .delete()
    .eq("id", id);
  if (error) return { error: "Could not delete. Please try again." };
  revalidatePath("/history");
  return { ok: true };
}
