"use client";

import { toast } from "@/components/toast";

// Copies a pre-built plain-text summary (assembled on the server) to the
// clipboard, ready to paste into WhatsApp or a report.
export function CopySummary({ text }: { text: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast("Summary copied ✓");
    } catch {
      toast("Couldn't copy — long-press to select instead.");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex h-11 items-center justify-center rounded-button border border-border bg-white px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
    >
      Copy Competitor Summary
    </button>
  );
}
