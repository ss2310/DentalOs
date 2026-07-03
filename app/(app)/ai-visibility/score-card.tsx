"use client";

import { toast } from "@/components/toast";
import { scoreTone, type Scorecard } from "@/lib/ai-visibility";

const toneText = {
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
} as const;
const toneDot = {
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
} as const;

export function ScoreCard({
  scorecard,
  copyText,
}: {
  scorecard: Scorecard;
  copyText: string;
}) {
  const tone = scoreTone(scorecard.pct);
  const size = 132;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const dash = (scorecard.pct / 100) * C;

  function copy() {
    navigator.clipboard?.writeText(copyText).then(
      () => toast("Scorecard copied ✓"),
      () => toast("Couldn't copy — select the text manually."),
    );
  }

  return (
    <div className="rounded-card border border-border bg-white p-5 sm:p-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        {/* Ring */}
        <div
          className={`relative shrink-0 ${toneText[tone]}`}
          style={{ width: size, height: size }}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={stroke}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth={stroke}
              strokeDasharray={`${dash} ${C}`}
              strokeLinecap="round"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-3xl font-semibold text-text-primary">
              {scorecard.pct}%
            </span>
            <span className="text-xs text-text-secondary">cited</span>
          </div>
        </div>

        {/* Per-engine + meta */}
        <div className="min-w-0 flex-1 self-stretch">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-text-secondary">
                AI Visibility Score
              </p>
              <p className="mt-0.5 text-sm text-text-secondary">
                Cited in {scorecard.cited} of {scorecard.total} query × engine
                checks
              </p>
            </div>
            <button
              type="button"
              onClick={copy}
              className="hidden shrink-0 rounded-button border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-subtle sm:block"
            >
              Copy Summary
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {scorecard.perEngine.map((e) => (
              <div
                key={e.engine}
                className="rounded-button border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${toneDot[scoreTone(e.pct)]}`}
                  />
                  <span className="truncate text-sm font-medium text-text-primary">
                    {e.label}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-text-secondary">
                  {e.pct}% · {e.cited}/{e.total}
                </p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={copy}
            className="mt-4 w-full rounded-button border border-border px-3 py-2.5 text-sm font-medium text-text-primary hover:bg-subtle sm:hidden"
          >
            Copy Scorecard Summary
          </button>
        </div>
      </div>
    </div>
  );
}
