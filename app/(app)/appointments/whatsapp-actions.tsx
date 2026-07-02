"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import type { WaAction, WaActionKind } from "./wa-actions";
import {
  send24hReminder,
  send1hReminder,
  recoverNoShow,
  recoverCancelled,
  requestReview,
  type ApptActionState,
} from "./actions";

const RUNNERS: Record<WaActionKind, (id: string) => Promise<ApptActionState>> = {
  "24h": send24hReminder,
  "1h": send1hReminder,
  recover_noshow: recoverNoShow,
  recover_cancelled: recoverCancelled,
  review: requestReview,
};

export function WhatsAppActions({
  id,
  actions,
}: {
  id: string;
  actions: WaAction[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((a, idx) => {
        if (a.state === "sent") {
          return (
            <span
              key={idx}
              className="inline-flex h-11 items-center rounded-button px-3 text-sm font-medium text-success"
            >
              ✓ Sent
            </span>
          );
        }

        return (
          <button
            key={idx}
            type="button"
            disabled={pending}
            onClick={() => {
              // Open the wa.me tab synchronously (in the click) so it isn't
              // blocked as a popup, THEN record the send.
              if (a.url) {
                window.open(a.url, "_blank", "noopener,noreferrer");
              }
              const run = RUNNERS[a.kind];
              startTransition(async () => {
                const res = await run(id);
                if (res?.error) {
                  toast(res.error);
                  return;
                }
                router.refresh();
              });
            }}
            className="flex h-11 items-center gap-1.5 rounded-button border border-success/30 bg-success/5 px-3 text-sm font-medium text-success hover:bg-success/10 disabled:opacity-60"
          >
            <WhatsAppIcon width={16} height={16} />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
