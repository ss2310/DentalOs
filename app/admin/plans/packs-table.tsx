"use client";

import { useState, useTransition } from "react";
import { updatePack, addPack } from "./actions";

export type PackRow = {
  id: string;
  name: string;
  price_inr: number | string;
  content_credits: number;
  map_credits: number;
  is_active: boolean;
  sort_order: number;
};

const inputBase =
  "h-10 rounded-button border border-border bg-white px-2 text-sm text-text-primary outline-none focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20";

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

function PackRowEditor({ row }: { row: PackRow }) {
  const initial = {
    name: row.name,
    price: String(row.price_inr),
    content: String(row.content_credits),
    map: String(row.map_credits),
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
      const res = await updatePack(row.id, {
        name: v.name.trim(),
        price_inr: Number(v.price),
        content_credits: Number(v.content),
        map_credits: Number(v.map),
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
      <tr className="border-b border-border align-middle">
        <td className="px-3 py-2">
          <input
            value={v.name}
            onChange={(e) => set({ name: e.target.value })}
            className={`${inputBase} w-44`}
            aria-label="Pack name"
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
          <td colSpan={7} className="px-3 pb-2">
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function AddPackRow() {
  const empty = { name: "", price: "", content: "", map: "", sort: "", active: false };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (patch: Partial<typeof v>) => setV((s) => ({ ...s, ...patch }));

  const add = () => {
    setError(null);
    start(async () => {
      const res = await addPack({
        name: v.name.trim(),
        price_inr: Number(v.price),
        content_credits: Number(v.content),
        map_credits: Number(v.map),
        is_active: v.active,
        sort_order: v.sort === "" ? 0 : Number(v.sort),
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setV(empty); // cleared; the revalidated list shows the new row
    });
  };

  return (
    <>
      <tr className="border-t-2 border-border bg-subtle align-middle">
        <td className="px-3 py-2">
          <input
            value={v.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="New pack name"
            className={`${inputBase} w-44`}
            aria-label="New pack name"
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
            placeholder="0"
            className={`${inputBase} w-24 tabular-nums`}
            aria-label="New pack price in ₹"
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
            placeholder="0"
            className={`${inputBase} w-20 tabular-nums`}
            aria-label="New pack content credits"
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
            placeholder="0"
            className={`${inputBase} w-20 tabular-nums`}
            aria-label="New pack map credits"
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={v.sort}
            onChange={(e) => set({ sort: e.target.value })}
            type="number"
            min={0}
            step="1"
            inputMode="numeric"
            placeholder="0"
            className={`${inputBase} w-16 tabular-nums`}
            aria-label="New pack sort order"
          />
        </td>
        <td className="px-3 py-2">
          <Toggle
            on={v.active}
            onClick={() => set({ active: !v.active })}
            label="Toggle new pack active"
          />
        </td>
        <td className="px-3 py-2 text-right">
          <button
            type="button"
            onClick={add}
            disabled={pending || !v.name.trim()}
            className="min-h-[40px] rounded-button bg-[#4F46E5] px-3 text-sm font-medium text-white transition-opacity hover:bg-[#4338CA] disabled:opacity-40"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </td>
      </tr>
      {error ? (
        <tr>
          <td colSpan={7} className="px-3 pb-2">
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function PacksTable({ rows }: { rows: PackRow[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Credit packs
      </h2>
      <div className="overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-3 py-3 font-semibold">Name</th>
              <th className="px-3 py-3 font-semibold">Price ₹</th>
              <th className="px-3 py-3 font-semibold">Content</th>
              <th className="px-3 py-3 font-semibold">Map</th>
              <th className="px-3 py-3 font-semibold">Sort</th>
              <th className="px-3 py-3 font-semibold">Active</th>
              <th className="px-3 py-3 text-right font-semibold">Save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <PackRowEditor key={r.id} row={r} />
            ))}
            <AddPackRow />
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        A pack can only go live at a price above ₹0 and must grant some credits.
        Price changes are logged to billing history.
      </p>
    </div>
  );
}
