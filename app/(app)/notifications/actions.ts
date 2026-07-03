"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type NotifActionState = { ok?: boolean; error?: string };

/** Mark one notification read (no-op if already read) and decrement the count. */
export async function markNotificationRead(
  id: string,
): Promise<NotifActionState> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_notification_read", { p_id: id });
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/notifications");
  return { ok: true };
}

/** Mark all of the caller's visible notifications read and zero the count. */
export async function markAllNotificationsRead(): Promise<NotifActionState> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) return { error: "Could not update. Please try again." };
  revalidatePath("/notifications");
  return { ok: true };
}
