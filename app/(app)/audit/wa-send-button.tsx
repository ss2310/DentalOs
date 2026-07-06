"use client";

import { WhatsAppIcon } from "@/components/icons";

// One-tap WhatsApp for a pre-composed Hinglish message (digest / mid-plan nudge).
// Numberless wa.me link — the owner picks the recipient (or sends to self/staff),
// per the project's manual-messaging rule. Opens in a new tab.
export function WaSendButton({
  message,
  label = "Send on WhatsApp",
}: {
  message: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        window.open(
          `https://wa.me/?text=${encodeURIComponent(message)}`,
          "_blank",
          "noopener,noreferrer",
        )
      }
      className="flex h-11 items-center gap-2 rounded-button border border-success/30 bg-success/5 px-3.5 text-sm font-medium text-success hover:bg-success/10"
    >
      <WhatsAppIcon width={16} height={16} />
      {label}
    </button>
  );
}
