"use client";

import { useState } from "react";
import type { GridScanPoint } from "@/lib/types";
import { rankColor, rankTextColor } from "@/components/rank-colors";

// Colour heatmap of a grid scan. Shared by the clinic Map Rank detail and the
// agency/public prospect report — same visual language everywhere.
export function Heatmap({
  points,
  gridSize,
}: {
  points: GridScanPoint[];
  gridSize: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="rounded-card border border-border bg-white p-10 text-center">
        <p className="text-[15px] text-text-secondary">
          No grid data in this scan.
        </p>
      </div>
    );
  }

  const sel = selected != null ? points[selected] : null;

  return (
    <div className="rounded-card border border-border bg-white p-4">
      <div
        className="mx-auto grid gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${gridSize}, minmax(0, 1fr))`,
          maxWidth: `${gridSize * 56}px`,
        }}
      >
        {points.map((p, i) => {
          const isSel = i === selected;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSelected(isSel ? null : i)}
              className={`flex aspect-square min-h-[44px] items-center justify-center rounded text-sm font-semibold ${
                isSel ? "ring-2 ring-primary ring-offset-1" : ""
              }`}
              style={{
                backgroundColor: rankColor(p.rank),
                color: rankTextColor(p.rank),
              }}
              aria-label={p.rank == null ? "Not found" : `Rank ${p.rank}`}
            >
              {p.rank == null ? "✕" : p.rank}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-text-secondary">
        {[
          { label: "1–3", c: "#059669" },
          { label: "4–7", c: "#86EFAC" },
          { label: "8–10", c: "#FDE047" },
          { label: "11–15", c: "#FB923C" },
          { label: "16–20", c: "#DC2626" },
          { label: "Not found", c: "#E5E7EB" },
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
          Selected point: {sel.lat.toFixed(4)}, {sel.lng.toFixed(4)} —{" "}
          {sel.rank == null ? "not found" : `rank ${sel.rank}`}
        </p>
      ) : (
        <p className="mt-3 text-center text-sm text-text-secondary">
          Tap a cell to see its coordinates.
        </p>
      )}
    </div>
  );
}
