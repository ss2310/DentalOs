"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { ChevronDownIcon } from "@/components/icons";
import { setPlanItemStatus } from "./actions";

export type PlanItemView = {
  id: string;
  day_number: number;
  title: string;
  description: string | null;
  evidence: string | null;
  competitor_context: string | null;
  effort: string | null;
  status: "pending" | "done" | "skipped";
};

const EFFORT_LABEL: Record<string, string> = {
  "15-min": "15 min",
  "1-hour": "1 hour",
  "needs-help": "Needs help",
};

export function PlanItemRow({ item }: { item: PlanItemView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const done = item.status === "done";
  const skipped = item.status === "skipped";

  function setStatus(status: "pending" | "done" | "skipped", msg: string) {
    startTransition(async () => {
      const res = await setPlanItemStatus(item.id, status);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(msg);
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-card border bg-white shadow-card ${
        done ? "border-success/30" : skipped ? "border-border opacity-60" : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
        aria-expanded={open}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-pill text-xs font-semibold ${
            done
              ? "bg-success/10 text-success"
              : "bg-primary/10 text-primary"
          }`}
        >
          {done ? "✓" : `D${item.day_number}`}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[15px] font-medium ${
              done || skipped ? "text-text-secondary line-through" : "text-text-primary"
            }`}
          >
            {item.title}
          </span>
        </span>
        {item.effort ? (
          <span className="shrink-0 rounded-pill bg-subtle px-2.5 py-1 text-xs font-medium text-text-secondary">
            {EFFORT_LABEL[item.effort] ?? item.effort}
          </span>
        ) : null}
        <ChevronDownIcon
          width={16}
          height={16}
          className={`shrink-0 text-text-secondary/60 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border px-4 py-3.5">
          {item.description ? (
            <p className="text-[15px] leading-relaxed text-text-primary">
              {item.description}
            </p>
          ) : null}
          {item.evidence ? (
            <div className="rounded-button bg-subtle px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
                The numbers
              </p>
              <p className="mt-1 text-sm text-text-primary">{item.evidence}</p>
            </div>
          ) : null}
          {item.competitor_context ? (
            <p className="text-sm text-text-secondary">
              <span className="font-medium text-text-primary">Why now: </span>
              {item.competitor_context}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 pt-1">
            {done || skipped ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setStatus("pending", "Marked as to-do")}
                className="flex h-11 items-center rounded-button border border-border px-3.5 text-sm font-medium text-text-primary hover:bg-subtle disabled:opacity-60"
              >
                Undo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus("done", "Nice — one down 🎉")}
                  className="flex h-11 items-center rounded-button bg-success px-3.5 text-sm font-medium text-white hover:bg-success/90 disabled:opacity-60"
                >
                  Mark done
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus("skipped", "Skipped")}
                  className="flex h-11 items-center rounded-button border border-border px-3.5 text-sm font-medium text-text-secondary hover:bg-subtle disabled:opacity-60"
                >
                  Skip
                </button>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
