"use client";

import { WhatsAppIcon } from "@/components/icons";

// Share the plan to WhatsApp — a numberless wa.me link (owner picks the
// recipient) carrying a short Hinglish summary + the current report URL. Built
// client-side so window.location gives the exact link the owner is viewing.
export function ShareButton({
  taskCount,
  competitorName,
  quickFirst,
}: {
  taskCount: number;
  competitorName: string | null;
  quickFirst: boolean;
}) {
  function share() {
    const url = window.location.href;
    const lead = competitorName
      ? `${competitorName} se aage nikalne ke ${taskCount} kaam`
      : `${taskCount} kaam`;
    const first = quickFirst ? ", pehla sirf 15 minute ka" : "";
    const msg = `Aapka 30-din ka growth plan taiyaar hai — ${lead}${first} 👇\n${url}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(msg)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <button
      type="button"
      onClick={share}
      className="flex h-11 items-center gap-2 rounded-button border border-success/30 bg-success/5 px-3.5 text-sm font-medium text-success hover:bg-success/10"
    >
      <WhatsAppIcon width={16} height={16} />
      Share plan
    </button>
  );
}
