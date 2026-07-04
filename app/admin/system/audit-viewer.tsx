"use client";

import { useMemo, useState } from "react";
import { formatRelativeTime } from "@/lib/format";

export type AuditRow = {
  id: string;
  source: "admin" | "billing";
  when: string; // ISO
  actorId: string | null;
  actorName: string;
  action: string;
  clinic: string;
  note: string;
};

const selectClass =
  "min-h-[40px] rounded-button border border-border bg-white px-2 text-sm text-text-primary outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

export function AuditViewer({ rows }: { rows: AuditRow[] }) {
  const [actor, setActor] = useState("");
  const [type, setType] = useState("");

  // Filter options come from the whole (unfiltered) set so they never vanish
  // as you narrow down.
  const actorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of rows) if (r.actorId) seen.set(r.actorId, r.actorName);
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const typeOptions = useMemo(
    () => Array.from(new Set(rows.map((r) => r.action))).sort(),
    [rows],
  );

  const filtered = rows.filter(
    (r) => (!actor || r.actorId === actor) && (!type || r.action === type),
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          aria-label="Filter by actor"
          className={selectClass}
        >
          <option value="">All actors</option>
          {actorOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="Filter by action / event type"
          className={selectClass}
        >
          <option value="">All actions</option>
          {typeOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {actor || type ? (
          <button
            type="button"
            onClick={() => {
              setActor("");
              setType("");
            }}
            className="min-h-[40px] rounded-button px-2 text-sm font-medium text-[#4F46E5] hover:underline"
          >
            Clear
          </button>
        ) : null}
        <span className="ml-auto text-xs text-text-secondary">
          {filtered.length} of {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-3 font-semibold">When</th>
              <th className="px-3 py-3 font-semibold">Actor</th>
              <th className="px-3 py-3 font-semibold">Action</th>
              <th className="px-3 py-3 font-semibold">Clinic</th>
              <th className="px-3 py-3 font-semibold">Note</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-text-secondary">
                  No matching entries.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={`${r.source}:${r.id}`} className="border-b border-border last:border-0 align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-text-secondary" title={r.when}>
                    {formatRelativeTime(r.when)}
                  </td>
                  <td className="px-3 py-2 text-text-primary">{r.actorName}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-text-primary">{r.action}</span>
                    <span
                      className={`ml-2 rounded-pill px-2 py-0.5 text-[11px] font-medium ${
                        r.source === "admin"
                          ? "bg-[#4F46E5]/10 text-[#4F46E5]"
                          : "bg-black/5 text-text-secondary"
                      }`}
                    >
                      {r.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{r.clinic}</td>
                  <td className="px-3 py-2 text-text-secondary">{r.note}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
