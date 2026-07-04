"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import { sendCampaignMessage, markCampaignDone } from "../actions";

/** Per-row WhatsApp send. Opens the wa.me tab synchronously, then records it. */
export function SendButton({
  campaignId,
  patientId,
  waUrl,
  sent,
  disabled,
}: {
  campaignId: string;
  patientId: string;
  waUrl: string | null;
  sent: boolean;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (sent) {
    return (
      <span className="inline-flex h-11 items-center rounded-button px-3 text-sm font-medium text-success">
        ✓ Sent
      </span>
    );
  }
  if (!waUrl) {
    return (
      <span className="inline-flex h-11 items-center text-sm text-text-secondary">
        No WhatsApp
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={pending || disabled}
      onClick={() => {
        // Open the tab inside the click so it isn't blocked, THEN record.
        window.open(waUrl, "_blank", "noopener,noreferrer");
        startTransition(async () => {
          const res = await sendCampaignMessage(campaignId, patientId);
          if (res?.error) {
            toast(res.error);
            return;
          }
          router.refresh();
        });
      }}
      className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-3.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
    >
      <WhatsAppIcon width={16} height={16} />
      Send
    </button>
  );
}

/** Finish the campaign. */
export function MarkDoneButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await markCampaignDone(campaignId);
          if (res?.error) {
            toast(res.error);
            return;
          }
          router.refresh();
        })
      }
      className="flex h-11 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle disabled:opacity-60"
    >
      {pending ? "Saving…" : "Mark Done"}
    </button>
  );
}
