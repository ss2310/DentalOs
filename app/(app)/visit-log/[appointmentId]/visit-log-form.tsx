"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { formatINR } from "@/lib/format";
import type { RateCardOption } from "@/lib/types";
import { logVisit, type VisitLogState } from "./actions";

const initialState: VisitLogState = {};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

// Rate cards carry base_price (numeric → string from Supabase) for prefill.
type RateCard = RateCardOption & { base_price: string };

// Pending-aware submit button (must live inside the <form>).
function SaveVisitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="flex h-12 w-full items-center justify-center rounded-button bg-success px-4 text-base font-semibold text-white hover:bg-success/90 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Saving…" : "Save Visit"}
    </button>
  );
}

export function VisitLogForm({
  appointmentId,
  rateCards,
  initialTreatmentId,
  initialDoctor,
}: {
  appointmentId: string;
  rateCards: RateCard[];
  initialTreatmentId: string;
  initialDoctor: string;
}) {
  const [state, formAction] = useFormState(logVisit, initialState);
  const router = useRouter();

  const priceOf = (id: string) =>
    Number(rateCards.find((r) => r.id === id)?.base_price ?? 0);

  const [treatmentId, setTreatmentId] = useState(initialTreatmentId);
  const [cost, setCost] = useState(
    initialTreatmentId ? String(priceOf(initialTreatmentId)) : "",
  );
  const [paid, setPaid] = useState("0");
  const [doctor, setDoctor] = useState(initialDoctor);
  const [mode, setMode] = useState("cash");

  const costNum = Number(cost) || 0;
  const paidNum = Number(paid) || 0;
  const overpaid = paidNum > costNum;
  const outstanding = costNum - paidNum;

  useEffect(() => {
    if (state.ok && state.patientId) {
      toast("Visit logged ✓");
      router.push(`/patients/${state.patientId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function onTreatmentChange(id: string) {
    setTreatmentId(id);
    // Re-fill cost from the newly selected treatment's base price.
    setCost(id ? String(priceOf(id)) : "");
  }

  const canSave =
    !!treatmentId && costNum >= 0 && paidNum >= 0 && !overpaid;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="appointment_id" value={appointmentId} />

      {state.error ? (
        <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div>
        <label htmlFor="treatment_id" className={labelClass}>
          Treatment
        </label>
        <select
          id="treatment_id"
          name="treatment_id"
          required
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
        <label htmlFor="doctor" className={labelClass}>
          Doctor
        </label>
        <input
          id="doctor"
          name="doctor"
          type="text"
          value={doctor}
          onChange={(e) => setDoctor(e.target.value)}
          className={inputClass}
          placeholder="Doctor name"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="cost" className={labelClass}>
            Treatment Cost (₹)
          </label>
          <input
            id="cost"
            name="cost"
            type="number"
            min={0}
            step="1"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="amount_paid" className={labelClass}>
            Amount Paid (₹)
          </label>
          <input
            id="amount_paid"
            name="amount_paid"
            type="number"
            min={0}
            step="1"
            value={paid}
            onChange={(e) => setPaid(e.target.value)}
            className={`${inputClass} ${overpaid ? "border-danger focus:ring-danger/20" : ""}`}
          />
        </div>
      </div>

      <div>
        <label htmlFor="payment_mode" className={labelClass}>
          Payment Mode
        </label>
        <select
          id="payment_mode"
          name="payment_mode"
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

      {/* Live outstanding calculation */}
      <div className="rounded-button border border-border bg-subtle px-3 py-3">
        {overpaid ? (
          <p className="text-sm font-medium text-danger">
            Amount paid cannot exceed the treatment cost.
          </p>
        ) : (
          <p className="text-[15px] font-medium">
            <span className="text-text-secondary">Outstanding Amount: </span>
            <span
              style={{ color: outstanding > 0 ? "#DC2626" : "#059669" }}
            >
              {formatINR(outstanding)}
            </span>
          </p>
        )}
      </div>

      <SaveVisitButton disabled={!canSave} />
    </form>
  );
}
