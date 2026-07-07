"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { formatINR } from "@/lib/format";
import {
  addRateCard,
  updateRateCard,
  setRateCardActive,
  type RateCardInput,
} from "./actions";

export type RateCard = {
  id: string;
  treatment_name: string;
  category: string | null;
  base_price: string;
  duration_mins: number | null;
  recall_interval_days: number | null;
  is_active: boolean;
};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

function empty(): RateCardInput {
  return {
    treatment_name: "",
    category: "",
    base_price: "",
    duration_mins: "",
    recall_interval_days: "",
  };
}

export function RateCardManager({ rateCards }: { rateCards: RateCard[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RateCard | null>(null);
  const [form, setForm] = useState<RateCardInput>(empty());

  const active = rateCards.filter((c) => c.is_active);
  const inactive = rateCards.filter((c) => !c.is_active);

  function openAdd() {
    setEditing(null);
    setForm(empty());
    setModalOpen(true);
  }

  function openEdit(c: RateCard) {
    setEditing(c);
    setForm({
      treatment_name: c.treatment_name,
      category: c.category ?? "",
      base_price: String(c.base_price ?? ""),
      duration_mins: c.duration_mins != null ? String(c.duration_mins) : "",
      recall_interval_days:
        c.recall_interval_days != null ? String(c.recall_interval_days) : "",
    });
    setModalOpen(true);
  }

  function save() {
    startTransition(async () => {
      const res = editing
        ? await updateRateCard(editing.id, form)
        : await addRateCard(form);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(editing ? "Treatment updated ✓" : "Treatment added ✓");
      setModalOpen(false);
      router.refresh();
    });
  }

  function toggleActive(c: RateCard, active: boolean) {
    startTransition(async () => {
      const res = await setRateCardActive(c.id, active);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(active ? "Treatment reactivated" : "Treatment deactivated");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {active.length} active treatment{active.length === 1 ? "" : "s"}
        </p>
        <button type="button" className={btnPrimary} onClick={openAdd}>
          + Add Treatment
        </button>
      </div>

      {active.length === 0 ? (
        <div className="mt-4 rounded-card border border-border bg-white p-8 text-center text-sm text-text-secondary">
          No active treatments. Add your first one.
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-4 hidden overflow-hidden rounded-card border border-border bg-white lg:block">
            <table className="w-full text-left text-[15px]">
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                  <th className="px-4 py-3 font-medium">Treatment</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 text-right font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Duration</th>
                  <th className="px-4 py-3 font-medium">Recall</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {c.treatment_name}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.category ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-text-primary">
                      {formatINR(c.base_price)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.duration_mins != null ? `${c.duration_mins} min` : "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.recall_interval_days != null
                        ? `${c.recall_interval_days} days`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className={btnOutline}
                          disabled={pending}
                          onClick={() => openEdit(c)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className={`${btnBase} border border-danger/30 text-danger hover:bg-danger/5`}
                          disabled={pending}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Deactivate "${c.treatment_name}"? It stays in history but won't be selectable.`,
                              )
                            ) {
                              toggleActive(c, false);
                            }
                          }}
                        >
                          Deactivate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="mt-4 space-y-3 lg:hidden">
            {active.map((c) => (
              <div
                key={c.id}
                className="rounded-card border border-border bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-text-primary">
                    {c.treatment_name}
                  </p>
                  <span className="font-semibold text-text-primary">
                    {formatINR(c.base_price)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-text-secondary">
                  {c.category ? <span>{c.category}</span> : null}
                  {c.duration_mins != null ? (
                    <span>{c.duration_mins} min</span>
                  ) : null}
                  {c.recall_interval_days != null ? (
                    <span>recall {c.recall_interval_days}d</span>
                  ) : null}
                </div>
                <div className="mt-3 flex gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    className={btnOutline}
                    disabled={pending}
                    onClick={() => openEdit(c)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={`${btnBase} border border-danger/30 text-danger hover:bg-danger/5`}
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Deactivate "${c.treatment_name}"?`)) {
                        toggleActive(c, false);
                      }
                    }}
                  >
                    Deactivate
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Deactivated (collapsed) */}
      {inactive.length > 0 ? (
        <details className="mt-6 rounded-card border border-border bg-white">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-text-secondary">
            Deactivated ({inactive.length})
          </summary>
          <div className="border-t border-border">
            {inactive.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
              >
                <div>
                  <p className="text-[15px] text-text-primary">
                    {c.treatment_name}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {formatINR(c.base_price)}
                    {c.category ? ` · ${c.category}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className={btnOutline}
                  disabled={pending}
                  onClick={() => toggleActive(c, true)}
                >
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {/* Add / edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Treatment" : "Add Treatment"}
      >
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Treatment name <span className="text-danger">*</span>
            </label>
            <input
              className={inputClass}
              value={form.treatment_name}
              onChange={(e) =>
                setForm((f) => ({ ...f, treatment_name: e.target.value }))
              }
              placeholder="e.g. Consultation"
            />
          </div>
          <div>
            <label className={labelClass}>Category</label>
            <input
              className={inputClass}
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({ ...f, category: e.target.value }))
              }
              placeholder="e.g. category (optional)"
            />
          </div>
          <div>
            <label className={labelClass}>
              Price (₹) <span className="text-danger">*</span>
            </label>
            <input
              type="number"
              min={0}
              inputMode="numeric"
              className={inputClass}
              value={form.base_price}
              onChange={(e) =>
                setForm((f) => ({ ...f, base_price: e.target.value }))
              }
              placeholder="4500"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Duration (mins)</label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                className={inputClass}
                value={form.duration_mins}
                onChange={(e) =>
                  setForm((f) => ({ ...f, duration_mins: e.target.value }))
                }
                placeholder="Optional"
              />
            </div>
            <div>
              <label className={labelClass}>Recall (days)</label>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                className={inputClass}
                value={form.recall_interval_days}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    recall_interval_days: e.target.value,
                  }))
                }
                placeholder="Optional"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className={`${btnOutline} flex-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !form.treatment_name.trim()}
              className={`${btnPrimary} flex-1`}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
