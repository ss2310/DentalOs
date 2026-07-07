"use client";

import { useState } from "react";
import type { CompetitorCell } from "@/lib/types";

// Colours by design-system tokens: success / warning / danger / border.
const STATE_STYLE: Record<
  CompetitorCell["state"],
  { bg: string; fg: string; symbol: string }
> = {
  win: { bg: "#059669", fg: "#FFFFFF", symbol: "✓" }, // you're top-3 here
  behind: { bg: "#D97706", fg: "#FFFFFF", symbol: "•" }, // present, rival leads
  absent: { bg: "#DC2626", fg: "#FFFFFF", symbol: "✕" }, // missing, rivals rank
  empty: { bg: "#E5E7EB", fg: "#6B7280", symbol: "–" }, // no data here
};

function describe(c: CompetitorCell): string {
  switch (c.state) {
    case "win":
      return `You rank #${c.your_rank} here — in the top 3.`;
    case "behind":
      return `You're #${c.your_rank} here${
        c.leader_name ? `; ${c.leader_name} leads.` : "."
      }`;
    case "absent":
      return `You don't appear here${
        c.leader_name ? `; ${c.leader_name} leads.` : "."
      }`;
    default:
      return "No results at this point.";
  }
}

export function GapMap({
  cells,
  gridSize,
}: {
  cells: CompetitorCell[];
  gridSize: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  if (cells.length === 0) {
    return (
      <div className="rounded-card border border-border bg-white p-10 text-center">
        <p className="text-[15px] text-text-secondary">
          No grid data in this scan.
        </p>
      </div>
    );
  }

  const sel = selected != null ? cells[selected] : null;

  return (
    <div className="rounded-card border border-border bg-white p-4">
      <div
        className="mx-auto grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          maxWidth: `${gridSize * 56}px`,
        }}
      >
        {cells.map((c, i) => {
          const s = STATE_STYLE[c.state];
          const isSel = i === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(isSel ? null : i)}
              className={`flex aspect-square min-h-[44px] items-center justify-center rounded text-sm font-semibold ${
                isSel ? "ring-2 ring-primary ring-offset-1" : ""
              }`}
              style={{ backgroundColor: s.bg, color: s.fg }}
              aria-label={describe(c)}
            >
              {s.symbol}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        {[
          { label: "You're top-3", c: "#059669" },
          { label: "Rival leads", c: "#D97706" },
          { label: "You're absent", c: "#DC2626" },
          { label: "No data", c: "#E5E7EB" },
        ].map((l) => (
          <span key={l.label} className="flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: l.c }}
            />
            {l.label}
          </span>
        ))}
      </div>

      {sel ? (
        <p className="mt-3 text-center text-sm text-text-secondary">
          {sel.lat.toFixed(4)}, {sel.lng.toFixed(4)} — {describe(sel)}
        </p>
      ) : (
        <p className="mt-3 text-center text-sm text-text-secondary">
          Tap a cell to see where you&apos;re losing.
        </p>
      )}
    </div>
  );
}
