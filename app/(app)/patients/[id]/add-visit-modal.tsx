"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { formatINR } from "@/lib/format";
import { logWalkInVisit } from "./visit-actions";

// "Add today's treatment" from the patient profile — the walk-in twin of the
// appointment-based visit-log form (same fields, same validation), submitted
// via the log_walk_in_visit RPC so every rail (outstanding, recovery, rollups,
// recall, payment ledger) applies.

type RateCard = { id: string; treatment_name: string; base_price: string };

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";

export function AddVisitButton({
  patientId,
  rateCards,
  defaultDoctor,
}: {
  patientId: string;
  rateCards: RateCard[];
  defaultDoctor: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [treatmentId, setTreatmentId] = useState("");
  const [doctor, setDoctor] = useState(defaultDoctor);
  const [cost, setCost] = useState("");
  const [paid, setPaid] = useState("0");
  const [mode, setMode] = useState("cash");
  const [error, setError] = useState<string | null>(null);

  const priceOf = (id: string) =>
    rateCards.find((r) => r.id === id)?.base_price ?? "";

  const costNum = Number(cost) || 0;
  const paidNum = Number(paid) || 0;
  const overpaid = paidNum > costNum;
  const outstanding = costNum - paidNum;
  const canSave = !!treatmentId && costNum >= 0 && paidNum >= 0 && !overpaid;

  function openModal() {
    setTreatmentId("");
    setDoctor(defaultDoctor);
    setCost("");
    setPaid("0");
    setMode("cash");
    setError(null);
    setOpen(true);
  }

  function onTreatmentChange(id: string) {
    setTreatmentId(id);
    setCost(id ? String(Number(priceOf(id)) || 0) : "");
  }

  function save() {
    if (!canSave) return;
    setError(null);
    startTransition(async () => {
      const res = await logWalkInVisit({
        patientId,
        treatmentId,
        doctor,
        cost: costNum,
        amountPaid: paidNum,
        paymentMode: mode,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Visit logged ✓");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={`${btnBase} bg-primary text-white hover:bg-primary/90`}
      >
        + Add Treatment
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add Today's Treatment"
      >
        <div className="space-y-4">
          {error ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="walkin-treatment" className={labelClass}>
              Treatment <span className="text-danger">*</span>
            </label>
            <select
              id="walkin-treatment"
              value={treatmentId}
              onChange={(e) => onTreatmentChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Select treatment…</option>
              {rateCards.map((rc) => (
                <option key={rc.id} value={rc.id}>
                  {rc.treatment_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="walkin-doctor" className={labelClass}>
              Doctor
            </label>
            <input
              id="walkin-doctor"
              type="text"
              value={doctor}
              onChange={(e) => setDoctor(e.target.value)}
              className={inputClass}
              placeholder="Doctor name"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="walkin-cost" className={labelClass}>
                Treatment Cost (₹)
              </label>
              <input
                id="walkin-cost"
                type="number"
                min={0}
                step="1"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="walkin-paid" className={labelClass}>
                Amount Paid (₹)
              </label>
              <input
                id="walkin-paid"
                type="number"
                min={0}
                step="1"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                className={`${inputClass} ${
                  overpaid ? "border-danger focus:ring-danger/20" : ""
                }`}
              />
            </div>
          </div>

          <div>
            <label htmlFor="walkin-mode" className={labelClass}>
              Payment Mode
            </label>
            <select
              id="walkin-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className={inputClass}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="card">Card</option>
              <option value="insurance">Insurance</option>
            </select>
          </div>

          {/* Live outstanding calculation (mirrors the visit-log form). */}
          <div className="rounded-button border border-border bg-subtle px-3 py-3">
            {overpaid ? (
              <p className="text-sm font-medium text-danger">
                Amount paid cannot exceed the treatment cost.
              </p>
            ) : (
              <p className="text-[15px] font-medium">
                <span className="text-text-secondary">Outstanding Amount: </span>
                <span className={outstanding > 0 ? "text-danger" : "text-success"}>
                  {formatINR(outstanding)}
                </span>
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={`${btnBase} flex-1 border border-border text-text-primary hover:bg-subtle`}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave || pending}
              className={`${btnBase} flex-1 bg-success text-white hover:bg-success/90`}
            >
              {pending ? "Saving…" : "Save Visit"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
