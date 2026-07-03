"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { createTreatmentPlan, markPlanSent } from "./treatment-plan-actions";

type PlanRateCard = { id: string; treatment_name: string; base_price: string };

export type SavedPlan = {
  id: string;
  plan_name: string;
  items: { name: string; cost: number }[];
  total_cost: string;
  sent_to_patient: boolean;
  created_at: string;
};

type ItemRow = { key: number; treatmentId: string; cost: string };

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

/** ₹ with Indian grouping, no decimals — matches the message format. */
function inr(v: number | string): string {
  return Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

export function TreatmentPlans({
  patientId,
  patientName,
  patientWhatsapp,
  doctorName,
  clinicName,
  clinicPhone,
  rateCards,
  plans,
}: {
  patientId: string;
  patientName: string;
  patientWhatsapp: string | null;
  doctorName: string;
  clinicName: string;
  clinicPhone: string;
  rateCards: PlanRateCard[];
  plans: SavedPlan[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [planName, setPlanName] = useState("");
  const [rows, setRows] = useState<ItemRow[]>([
    { key: 1, treatmentId: "", cost: "" },
  ]);
  const nextKey = useRef(2);

  function cardName(id: string): string {
    return rateCards.find((c) => c.id === id)?.treatment_name ?? "";
  }

  const total = rows.reduce(
    (s, r) => (r.treatmentId ? s + (Number(r.cost) || 0) : s),
    0,
  );
  const validRows = rows.filter((r) => r.treatmentId);
  const canSave = planName.trim() !== "" && validRows.length > 0;

  function reset() {
    setPlanName("");
    setRows([{ key: 1, treatmentId: "", cost: "" }]);
    nextKey.current = 2;
  }

  function addRow() {
    setRows((r) => [...r, { key: nextKey.current++, treatmentId: "", cost: "" }]);
  }

  function updateRow(key: number, patch: Partial<ItemRow>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function selectTreatment(key: number, treatmentId: string) {
    const price = rateCards.find((c) => c.id === treatmentId)?.base_price ?? "";
    updateRow(key, { treatmentId, cost: treatmentId ? String(price) : "" });
  }

  function removeRow(key: number) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  function save() {
    startTransition(async () => {
      const items = validRows.map((r) => ({
        name: cardName(r.treatmentId),
        cost: Number(r.cost) || 0,
      }));
      const res = await createTreatmentPlan({ patientId, planName, items });
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast("Treatment plan saved ✓");
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  function buildMessage(plan: SavedPlan): string {
    const doctor = doctorName.replace(/^dr\.?\s+/i, "").trim() || "your dentist";
    const lines = plan.items
      .map((i) => `${i.name} - ₹${inr(i.cost)}`)
      .join("\n");
    return (
      `🦷 *Treatment Plan*\n` +
      `Patient: ${patientName}\n` +
      `Doctor: Dr. ${doctor}\n\n` +
      `${lines}\n\n` +
      `*Total: ₹${inr(plan.total_cost)}*\n\n` +
      `${clinicName} | ${clinicPhone}`
    );
  }

  function send(plan: SavedPlan) {
    if (!patientWhatsapp) {
      toast("This patient has no WhatsApp number.");
      return;
    }
    // encodeURIComponent (inside waLink) leaves * literal, so WhatsApp bold survives.
    window.open(
      waLink(patientWhatsapp, buildMessage(plan)),
      "_blank",
      "noopener,noreferrer",
    );
    startTransition(async () => {
      await markPlanSent(plan.id, patientId);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
          Treatment Plan
        </h2>
        <button type="button" className={btnPrimary} onClick={() => setOpen(true)}>
          + Create Plan
        </button>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-6 text-center text-sm text-text-secondary">
          No treatment plans yet.
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className="rounded-card border border-border bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">{plan.plan_name}</p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {plan.items.length} item{plan.items.length === 1 ? "" : "s"} ·{" "}
                    {formatDate(plan.created_at)}
                  </p>
                </div>
                <span className="text-[15px] font-semibold text-text-primary">
                  ₹{inr(plan.total_cost)}
                </span>
              </div>

              <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-text-secondary">
                {plan.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between gap-3">
                    <span>{it.name}</span>
                    <span>₹{inr(it.cost)}</span>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                {plan.sent_to_patient ? (
                  <span className="inline-flex h-11 items-center text-sm font-medium text-success">
                    ✓ Sent
                  </span>
                ) : (
                  <button
                    type="button"
                    className={`${btnBase} gap-1.5 border border-success/30 bg-success/5 text-success hover:bg-success/10`}
                    disabled={pending || !patientWhatsapp}
                    onClick={() => send(plan)}
                  >
                    <WhatsAppIcon width={16} height={16} />
                    Send to Patient
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create plan modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="Create Treatment Plan">
        <div className="space-y-4">
          <div>
            <label className={labelClass}>
              Plan name <span className="text-danger">*</span>
            </label>
            <input
              className={inputClass}
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              placeholder="e.g. Full mouth rehabilitation"
            />
          </div>

          <div>
            <label className={labelClass}>Treatments</label>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className="flex gap-2">
                  <select
                    className={`${inputClass} flex-1`}
                    value={r.treatmentId}
                    onChange={(e) => selectTreatment(r.key, e.target.value)}
                  >
                    <option value="">Select treatment…</option>
                    {rateCards.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.treatment_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    className={`${inputClass} w-28`}
                    value={r.cost}
                    onChange={(e) => updateRow(r.key, { cost: e.target.value })}
                    placeholder="₹"
                    aria-label="Cost"
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(r.key)}
                    aria-label="Remove"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button border border-border text-text-secondary hover:bg-subtle disabled:opacity-40"
                    disabled={rows.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addRow}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              + Add treatment
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-sm text-text-secondary">Total</span>
            <span className="text-lg font-semibold text-text-primary">
              ₹{inr(total)}
            </span>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`${btnOutline} flex-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !canSave}
              className={`${btnPrimary} flex-1`}
            >
              {pending ? "Saving…" : "Save plan"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
