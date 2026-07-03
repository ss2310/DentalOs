"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LandingActionState = { ok?: boolean; error?: string };

// All queries are RLS-scoped to the caller's clinic (landing_pages policies,
// migration 007), so an id from another clinic simply matches no rows.

/** Take a page offline: status → 'draft'. The public /p route only serves published rows. */
export async function unpublishLandingPage(
  id: string,
): Promise<LandingActionState> {
  if (!id) return { error: "Missing page id." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase
    .from("landing_pages")
    .update({ status: "draft" })
    .eq("id", id);
  if (error) return { error: "Could not unpublish. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}

/** Permanently delete a hosted page. */
export async function deleteLandingPage(
  id: string,
): Promise<LandingActionState> {
  if (!id) return { error: "Missing page id." };
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("landing_pages").delete().eq("id", id);
  if (error) return { error: "Could not delete. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}
