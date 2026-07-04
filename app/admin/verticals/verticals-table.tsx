"use client";

import { useState, useTransition } from "react";
import { setVerticalActive } from "./actions";

export type VerticalRow = {
  id: string;
  display_name: string;
  is_active: boolean;
  postTypesSpecific: number;
  topicsSpecific: number;
};

export function VerticalsTable({ rows }: { rows: VerticalRow[] }) {
  const [state, setState] = useState(rows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string, next: boolean) => {
    setError(null);
    setState((s) => s.map((r) => (r.id === id ? { ...r, is_active: next } : r)));
    startTransition(async () => {
      const res = await setVerticalActive(id, next);
      if (res.error) {
        setState((s) =>
          s.map((r) => (r.id === id ? { ...r, is_active: !next } : r)),
        );
        setError(res.error);
      }
    });
  };

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-border bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-semibold">Vertical</th>
              <th className="px-4 py-3 font-semibold" title="Content templates scoped to this vertical (on top of the shared pool)">
                Templates
              </th>
              <th className="px-4 py-3 font-semibold" title="Topic suggestions scoped to this vertical">
                Topics
              </th>
              <th className="px-4 py-3 font-semibold" title="No few-shot store exists yet">
                Few-shots
              </th>
              <th className="px-4 py-3 font-semibold">Active</th>
            </tr>
          </thead>
          <tbody>
            {state.map((r) => {
              const isDental = r.id === "dental";
              return (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-text-primary">
                      {r.display_name}
                    </div>
                    <div className="text-xs text-text-secondary">{r.id}</div>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-text-primary">
                    {r.postTypesSpecific}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-text-primary">
                    {r.topicsSpecific}
                  </td>
                  <td className="px-4 py-3 text-text-secondary" title="No few-shot store yet">
                    —
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={r.is_active}
                      aria-label={`Toggle ${r.display_name}`}
                      disabled={pending || (isDental && r.is_active)}
                      title={
                        isDental
                          ? "Dental is the default vertical and can't be deactivated"
                          : undefined
                      }
                      onClick={() => toggle(r.id, !r.is_active)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors disabled:opacity-50 ${
                        r.is_active ? "bg-[#4F46E5]" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-pill bg-white shadow transition-transform ${
                          r.is_active ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        Seed a vertical&apos;s content with{" "}
        <code className="rounded bg-subtle px-1 py-0.5">
          npm run seed:vertical &lt;slug&gt;
        </code>{" "}
        (from a <code className="rounded bg-subtle px-1 py-0.5">seeds/verticals/</code>{" "}
        file), then activate it here once the counts look ready.
      </p>
    </div>
  );
}
