"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { formatRelativeTime } from "@/lib/format";
import {
  markNotificationRead,
  markAllNotificationsRead,
} from "./actions";

export type NotificationRow = {
  id: string;
  type: string;
  priority: "urgent" | "important" | "routine";
  title: string;
  body: string | null;
  action_url: string | null;
  status: "unread" | "read" | "acted_on";
  created_at: string;
};

// Left border color by priority (CLAUDE.md tokens).
const PRIORITY_BORDER: Record<NotificationRow["priority"], string> = {
  urgent: "border-l-danger",
  important: "border-l-warning",
  routine: "border-l-primary",
};

export function MarkAllButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const res = await markAllNotificationsRead();
          if (res?.error) {
            toast(res.error);
            return;
          }
          router.refresh();
        })
      }
      className="flex h-11 items-center rounded-button px-3.5 text-sm font-medium text-primary hover:bg-subtle disabled:opacity-40"
    >
      Mark all read
    </button>
  );
}

export function NotificationsList({
  notifications,
}: {
  notifications: NotificationRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  if (notifications.length === 0) {
    return (
      <div className="rounded-card border border-border bg-white p-10 text-center">
        <p className="text-[15px] font-medium text-success">
          ✓ All caught up
        </p>
      </div>
    );
  }

  function openNotification(n: NotificationRow) {
    startTransition(async () => {
      if (n.status === "unread") {
        await markNotificationRead(n.id);
      }
      if (n.action_url) {
        router.push(n.action_url);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => {
        const unread = n.status === "unread";
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => openNotification(n)}
            className={`flex w-full min-h-[44px] flex-col items-start gap-0.5 rounded-card border border-border border-l-4 p-4 text-left transition-colors hover:bg-subtle ${
              PRIORITY_BORDER[n.priority]
            } ${unread ? "bg-[#EFF6FF]" : "bg-white"}`}
          >
            <div className="flex w-full items-start justify-between gap-3">
              <span
                className={`text-[15px] text-text-primary ${
                  unread ? "font-semibold" : "font-normal"
                }`}
              >
                {n.title}
              </span>
              <span className="shrink-0 pt-0.5 text-xs text-text-secondary">
                {formatRelativeTime(n.created_at)}
              </span>
            </div>
            {n.body ? (
              <span className="text-sm text-text-secondary">{n.body}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
