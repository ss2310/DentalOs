"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { formatINR } from "@/lib/format";
import { recordPayment } from "../../billing/actions";

// Record Payment from the patient profile — same record_payment rail as the
// Billing page (one atomic RPC), trimmed to just amount + mode since the
// reminder/UPI actions already live in the profile's plan & billing flows.

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-60";

export function RecordPaymentButton({
  outstandingId,
  patientName,
  nettDue,
}: {
  outstandingId: string;
  patientName: string;
  nettDue: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("cash");
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const valid =
    amount.trim() !== "" &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    amountNum <= nettDue;

  function openModal() {
    setAmount("");
    setMode("cash");
    setError(null);
    setOpen(true);
  }

  function save() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      const res = await recordPayment(outstandingId, amountNum, mode);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast(`${formatINR(amountNum)} payment recorded ✓`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={pending}
        className={`${btnBase} bg-primary text-white hover:bg-primary/90`}
      >
        Record Payment
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Record Payment">
        <div className="space-y-4">
          <div className="rounded-button border border-border bg-subtle px-3 py-3">
            <p className="text-sm text-text-secondary">{patientName}</p>
            <p className="mt-0.5 text-[15px]">
              <span className="text-text-secondary">Balance due: </span>
              <span className="font-semibold text-danger">
                {formatINR(nettDue)}
              </span>
            </p>
          </div>

          {error ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor={`pp-amt-${outstandingId}`} className={labelClass}>
              Amount (₹)
            </label>
            <input
              id={`pp-amt-${outstandingId}`}
              type="number"
              min={1}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} ${
                amount.trim() !== "" && !valid ? "border-danger" : ""
              }`}
              placeholder={`Up to ${formatINR(nettDue)}`}
              autoFocus
            />
            {amount.trim() !== "" && !valid ? (
              <p className="mt-1 text-sm text-danger">
                Enter an amount between ₹1 and {formatINR(nettDue)}.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={`pp-mode-${outstandingId}`} className={labelClass}>
              Payment Mode
            </label>
            <select
              id={`pp-mode-${outstandingId}`}
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
              disabled={!valid || pending}
              className={`${btnBase} flex-1 bg-success text-white hover:bg-success/90`}
            >              {pending ? "Saving…" : "Save Payment"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
