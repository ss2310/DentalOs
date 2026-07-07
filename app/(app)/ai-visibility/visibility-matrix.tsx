"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import {
  AI_ENGINES,
  ENGINE_LABEL,
  LAYER_LABEL,
  type CellStatus,
} from "@/lib/ai-visibility";

type HistoryItem = {
  checked_at: string;
  status: CellStatus;
  position_note: string | null;
  cited_sources: string[] | null;
  raw_excerpt: string | null;
};
type Cell = { engine: string; status: CellStatus; history: HistoryItem[] };
export type MatrixRow = {
  id: string;
  query_text: string;
  query_layer: string | null;
  cells: Cell[];
};

const CELL: Record<CellStatus, { sym: string; cls: string; label: string }> = {
  cited: { sym: "✓", cls: "bg-success/10 text-success", label: "Cited" },
  mentioned: { sym: "~", cls: "bg-warning/10 text-warning", label: "Mentioned only" },
  absent: { sym: "✗", cls: "bg-danger/10 text-danger", label: "Absent" },
  unchecked: { sym: "–", cls: "bg-subtle text-text-secondary", label: "Not checked yet" },
};

export function VisibilityMatrix({ rows }: { rows: MatrixRow[] }) {
  const [open, setOpen] = useState<{ row: MatrixRow; cell: Cell } | null>(null);

  return (
    <div>
      <div className="overflow-x-auto rounded-card border border-border bg-white">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium text-text-secondary">Query</th>
              {AI_ENGINES.map((e) => (
                <th
                  key={e.key}
                  className="px-2 py-3 text-center font-medium text-text-secondary"
                >
                  {e.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 align-top">
                  <p className="text-text-primary">{r.query_text}</p>
                  {r.query_layer ? (
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {LAYER_LABEL[r.query_layer] ?? r.query_layer}
                    </p>
                  ) : null}
                </td>
                {r.cells.map((c) => {
                  const cell = CELL[c.status];
                  return (
                    <td key={c.engine} className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => setOpen({ row: r, cell: c })}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-button text-base font-semibold ${cell.cls}`}
                        aria-label={`${cell.label} — tap for history`}
                      >
                        {cell.sym}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} title="Check history">
        {open ? (
          <div className="space-y-4">
            <div>
              <p className="text-[15px] font-medium text-text-primary">
                {open.row.query_text}
              </p>
              <p className="text-sm text-text-secondary">
                {ENGINE_LABEL[open.cell.engine] ?? open.cell.engine}
              </p>
            </div>
            {open.cell.history.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No checks recorded for this combination yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {open.cell.history.map((h, idx) => {
                  const c = CELL[h.status];
                  return (
                    <li
                      key={idx}
                      className="rounded-button border border-border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-pill px-2 py-0.5 text-xs font-medium ${c.cls}`}
                        >
                          {c.label}
                        </span>
                        <span className="text-xs text-text-secondary">
                          {h.checked_at.slice(0, 10)}
                        </span>
                      </div>
                      {h.position_note ? (
                        <p className="mt-2 text-sm text-text-secondary">
                          Position: {h.position_note}
                        </p>
                      ) : null}
                      {h.cited_sources && h.cited_sources.length ? (
                        <p className="mt-1 text-sm text-text-secondary">
                          Sources: {h.cited_sources.join(", ")}
                        </p>
                      ) : null}
                      {h.raw_excerpt ? (
                        <p className="mt-1 text-sm italic text-text-secondary">
                          &ldquo;{h.raw_excerpt}&rdquo;
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
