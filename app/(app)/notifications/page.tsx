import { createClient } from "@/lib/supabase/server";
import {
  NotificationsList,
  MarkAllButton,
  type NotificationRow,
} from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = createClient();

  // RLS already narrows to notifications the caller may see (their own +
  // clinic-wide). Newest first, capped at 30.
  const { data } = await supabase
    .from("notifications")
    .select("id, type, priority, title, body, action_url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  const notifications = (data as NotificationRow[]) ?? [];
  const hasUnread = notifications.some((n) => n.status === "unread");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-primary">
          Notifications
        </h1>
        <MarkAllButton disabled={!hasUnread} />
      </div>

      <div className="mt-6">
        <NotificationsList notifications={notifications} />
      </div>
    </div>
  );
}
