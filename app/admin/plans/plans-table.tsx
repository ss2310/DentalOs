"use client";

import { useState, useTransition } from "react";
import { updatePlan, createAnnualPlan } from "./actions";

export type PlanRow = {
  id: string;
  name: string;
  price_inr: number | string;
  content_credits: number;
  map_credits: number;
  billing_period: string;
  is_active: boolean;
  sort_order: number;
};

const inputBase =
  "h-10 rounded-button border border-border bg-white px-2 text-sm text-text-primary outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

// Indigo toggle — matches the admin panel accent (not the clinic teal).
function Toggle({
  on,
  onClick,
  label,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors ${
        on ? "bg-[#4F46E5]" : "bg-border"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-pill bg-white shadow transition-transform ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function PlanRowEditor({ row }: { row: PlanRow }) {
  const initial = {
    name: row.name,
    price: String(row.price_inr),
    content: String(row.content_credits),
    map: String(row.map_credits),
    period: row.billing_period,
    sort: String(row.sort_order),
    active: row.is_active,
  };
  const [v, setV] = useState(initial);
  const [base, setBase] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = JSON.stringify(v) !== JSON.stringify(base);
  const set = (patch: Partial<typeof v>) => setV((s) => ({ ...s, ...patch }));

  const save = () => {
    setError(null);
    start(async () => {
      const res = await updatePlan(row.id, {
        name: v.name.trim(),
        price_inr: Number(v.price),
        content_credits: Number(v.content),
        map_credits: Number(v.map),
        billing_period: v.period,
        is_active: v.active,
        sort_order: Number(v.sort),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setBase(v);
    });
  };

  return (
    <>
      <tr className="border-b border-border last:border-0 align-middle">
        <td className="px-3 py-2">
          <input
            value={v.name}
            onChange={(e) => set({ name: e.target.value })}
            className={`${inputBase} w-40`}
            aria-label="Plan name"
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={v.price}
            onChange={(e) => set({ price: e.target.value })}
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className={`${inputBase} w-24 tabular-nums`}
            aria-label="Price in ₹"
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={v.content}
            onChange={(e) => set({ content: e.target.value })}
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            className={`${inputBase} w-20 tabular-nums`}
            aria-label="Content credits"
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={v.map}
            onChange={(e) => set({ map: e.target.value })}
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            className={`${inputBase} w-20 tabular-nums`}
            aria-label="Map credits"
          />
        </td>
        <td className="px-3 py-2">
          <select
            value={v.period}
            onChange={(e) => set({ period: e.target.value })}
            className={`${inputBase} w-28`}
            aria-label="Billing period"
          >
            <option value="trial">trial</option>
            <option value="monthly">monthly</option>
            <option value="annual">annual</option>
          </select>
        </td>
        <td className="px-3 py-2">
          <input
            value={v.sort}
            onChange={(e) => set({ sort: e.target.value })}
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            className={`${inputBase} w-16 tabular-nums`}
            aria-label="Sort order"
          />
        </td>
        <td className="px-3 py-2">
          <Toggle
            on={v.active}
            onClick={() => set({ active: !v.active })}
            label={`Toggle ${row.name} active`}
          />
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={save}
            disabled={!dirty || pending}
            className="min-h-[40px] rounded-button bg-[#4F46E5] px-3 text-sm font-medium text-white transition-opacity hover:bg-[#4338CA] disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={8} className="px-3 pb-2">
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function PlansTable({ rows, hasAnnual }: { rows: PlanRow[]; hasAnnual: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const makeAnnual = () => {
    setError(null);
    start(async () => {
      const res = await createAnnualPlan();
      if (res.error) setError(res.error);
    });
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Plans
        </h2>
        {!hasAnnual ? (
          <button
            type="button"
            onClick={makeAnnual}
            disabled={pending}
            className="min-h-[40px] rounded-button border border-[#4F46E5] px-3 text-sm font-medium text-[#4F46E5] transition-colors hover:bg-[#4F46E5]/5 disabled:opacity-40"
          >
            {pending ? "Creating…" : "+ Create Growth Annual (₹24,990)"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mb-3 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Price ₹</th>
              <th className="px-3 py-3 font-semibold">Content</th>
              <th className="px-3 py-3 font-semibold">Map</th>
              <th className="px-3 py-3 font-semibold">Period</th>
              <th className="px-3 py-3 font-semibold">Sort</th>
              <th className="px-3 py-3 font-semibold">Active</th>
              <th className="px-3 py-3 text-right font-semibold">Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PlanRowEditor key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        A plan can only go live at a price above ₹0 (the free trial plan is
        exempt). Price changes are logged to billing history.
      </p>
    </div>
  );
}
