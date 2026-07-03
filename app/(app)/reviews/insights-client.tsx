"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/toast";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/page";
import { generateInsightReport } from "./actions";

const COST = 2;

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-4 text-[15px] font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export type LastReport = {
  content: string;
  created_at: string;
} | null;

export function InsightsClient({
  remaining,
  ready,
  lastReport,
}: {
  remaining: number;
  ready: boolean; // is the Insight Report post type seeded?
  lastReport: LastReport;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creditsLeft, setCreditsLeft] = useState(remaining);

  const canAfford = creditsLeft >= COST;
  // What shows in the card: the just-generated result, else the last saved one.
  const shown = result ?? lastReport?.content ?? null;
  const shownDate = result ? null : lastReport?.created_at ?? null;

  function generate() {
    setError(null);
    startTransition(async () => {
      const res = await generateInsightReport();
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(res.content ?? "");
      if (typeof res.creditsLeft === "number") setCreditsLeft(res.creditsLeft);
      toast("Insight report ready ✓ — saved to History");
      router.refresh();
    });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast("Copied ✓"),
      () => toast("Could not copy."),
    );
  }

  return (
    <div>
      <div className="rounded-card border border-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-text-primary">
              Monthly Insight Report
            </h2>
            <p className="mt-1 text-sm text-text-secondary">
              An AI summary of your last 90 days — patient feedback, no-shows and
              revenue recovery — in plain English. Saved to{" "}
              <Link href="/history" className="font-medium text-primary hover:underline">
                History
              </Link>
              .
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-text-secondary">
              Credits left
            </p>
            <p
              className="font-display text-lg font-semibold"
              style={{ color: creditsLeft > 0 ? "#0F172A" : "#DC2626" }}
            >
              {creditsLeft}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={btnPrimary}
            disabled={pending || !ready || !canAfford}
            onClick={generate}
          >
            {pending ? (
              <span className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                Analysing…
              </span>
            ) : (
              "Generate Monthly Insight Report"
            )}
          </button>
          <span className="text-sm text-text-secondary">
            Uses{" "}
            <span className="font-medium text-text-primary">{COST} credits</span>.
          </span>
        </div>

        {!ready ? (
          <p className="mt-3 rounded-button border border-warning/30 bg-warning/5 px-3 py-2 text-sm text-text-primary">
            Insight Report isn&apos;t set up yet. Run{" "}
            <code className="rounded bg-subtle px-1.5 py-0.5 text-[13px]">
              supabase/migrations/010_insight_report.sql
            </code>{" "}
            in the Supabase SQL Editor.
          </p>
        ) : !canAfford ? (
          <p className="mt-3 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            Not enough credits for this ({COST} needed, {creditsLeft} left this
            month).
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {/* Generating skeleton */}
      {pending ? (
        <div className="mt-4 rounded-card border border-border bg-white p-6">
          <div className="flex items-center gap-3">
            <Spinner className="h-5 w-5 text-primary" />
            <p className="text-[15px] font-medium text-text-primary">
              Reading your last 90 days…
            </p>
          </div>
          <div className="mt-5 space-y-2.5" aria-hidden="true">
            <div className="h-3 w-1/3 animate-pulse rounded bg-subtle" />
            <div className="h-3 w-full animate-pulse rounded bg-subtle" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-subtle" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-subtle" />
          </div>
        </div>
      ) : null}

      {/* Result / last saved report */}
      {!pending && shown ? (
        <div className="mt-4 rounded-card border border-border bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
              {result ? "Your Insight Report" : "Last Insight Report"}
            </h2>
            {shownDate ? (
              <span className="text-xs text-text-secondary">
                {formatDate(shownDate)}
              </span>
            ) : null}
          </div>
          <div className="mt-3 whitespace-pre-wrap rounded-button border border-border bg-subtle p-4 text-[15px] leading-relaxed text-text-primary">
            {shown}
          </div>
          <div className="mt-4">
            <button type="button" className={btnOutline} onClick={() => copy(shown)}>
              Copy
            </button>
          </div>
        </div>
      ) : !pending ? (
        <div className="mt-4">
          <EmptyState>
            No insight report yet. Generate one to see what your last 90 days are
            telling you.
          </EmptyState>
        </div>
      ) : null}
    </div>
  );
}
