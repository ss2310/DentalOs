"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIST } from "@/lib/format";
import { getUserRole, isAdminRole } from "@/lib/roles";

export type HistoryActionState = { ok?: boolean; error?: string };

// SEC-M5: /history is an owner/doctor page; guard its mutations too so a
// receptionist can't publish or delete content via a crafted request. RLS
// still scopes tenancy — this closes the inconsistent role boundary.
async function guardAdmin(): Promise<HistoryActionState | null> {
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }
  return null;
}

/** Mark a draft/scheduled item as published (sets published_date to today). */
export async function markPublished(id: string): Promise<HistoryActionState> {
  const denied = await guardAdmin();
  if (denied) return denied;
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
  const denied = await guardAdmin();
  if (denied) return denied;
  const supabase = createClient();
  const { error } = await supabase
    .from("generated_content")
    .delete()
    .eq("id", id);
  if (error) return { error: "Could not delete. Please try again." };
  revalidatePath("/history");
  return { ok: true };
}
