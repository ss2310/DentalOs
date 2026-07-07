"use client";

import { toast } from "@/components/toast";

// Copies the public report URL. Prefers NEXT_PUBLIC_APP_URL (correct in
// production); falls back to the current origin so it works on localhost too.
export function CopyLink({ token }: { token: string }) {
  function copy() {
    const base =
      process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
      window.location.origin;
    const url = `${base}/audit/${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast("Shareable link copied ✓"),
      () => toast("Couldn't copy — long-press to select instead."),
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex h-11 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
    >
      Copy shareable link
    </button>
  );
}
