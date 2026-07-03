"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { runScan } from "../actions";

export function RunScan({
  keywordId,
  pointCount,
  remaining,
  cap,
}: {
  keywordId: string;
  pointCount: number;
  remaining: number;
  cap: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const overBudget = remaining < 1;

  function confirm() {
    startTransition(async () => {
      const res = await runScan(keywordId);
      if (res.error) {
        toast(res.error);
        return;
      }
      toast("Scan complete ✓");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
      >
        Run Scan
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Run Scan">
        <div className="space-y-4">
          <p className="text-[15px] text-text-primary">
            This runs a {pointCount}-point scan and uses{" "}
            <span className="font-semibold">1</span> of your {cap} monthly scans
            ({remaining} left this month). Continue?
          </p>

          {overBudget ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              You&apos;ve used all {cap} scans this month. Credit top-ups are
              coming once payments go live.
            </p>
          ) : null}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending || overBudget}
              className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Scanning…" : "Continue"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
