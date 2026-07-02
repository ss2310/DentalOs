"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import { formatINR } from "@/lib/format";
import { recordPayment, remindPayment } from "./actions";

export type BillingRowActionData = {
  id: string;
  patientName: string;
  nettDue: number;
  remindUrl: string | null;
  reminded: boolean; // reminded within the last 7 days
};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-60";

export function BillingRowActions({ row }: { row: BillingRowActionData }) {
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
    amountNum <= row.nettDue;

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
      const res = await recordPayment(row.id, amountNum, mode);
      if (res.error) {
        setError(res.error);
        return;
      }
      toast(`${formatINR(amountNum)} payment recorded ✓`);
      setOpen(false);
      router.refresh();
    });
  }

  function remind() {
    if (row.remindUrl) {
      window.open(row.remindUrl, "_blank", "noopener,noreferrer");
    }
    startTransition(async () => {
      const res = await remindPayment(row.id);
      if (res.error) {
        toast(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={openModal}
        disabled={pending}
        className={`${btnBase} bg-primary text-white hover:bg-primary/90`}
      >
        Record Payment
      </button>

      {row.reminded ? (
        <span className="inline-flex h-11 items-center rounded-button px-3 text-sm font-medium text-success">
          ✓ Reminded
        </span>
      ) : row.remindUrl ? (
        <button
          type="button"
          onClick={remind}
          disabled={pending}
          className={`${btnBase} gap-1.5 border border-success/30 bg-success/5 text-success hover:bg-success/10`}
        >
          <WhatsAppIcon width={16} height={16} />
          Remind
        </button>
      ) : null}

      <Modal open={open} onClose={() => setOpen(false)} title="Record Payment">
        <div className="space-y-4">
          <div className="rounded-button border border-border bg-subtle px-3 py-3">
            <p className="text-sm text-text-secondary">{row.patientName}</p>
            <p className="mt-0.5 text-[15px]">
              <span className="text-text-secondary">Balance due: </span>
              <span className="font-semibold text-danger">
                {formatINR(row.nettDue)}
              </span>
            </p>
          </div>

          {error ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor={`amt-${row.id}`} className={labelClass}>
              Amount (₹)
            </label>
            <input
              id={`amt-${row.id}`}
              type="number"
              min={1}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} ${
                amount.trim() !== "" && !valid ? "border-danger" : ""
              }`}
              placeholder={`Up to ${formatINR(row.nettDue)}`}
              autoFocus
            />
            {amount.trim() !== "" && !valid ? (
              <p className="mt-1 text-sm text-danger">
                Enter an amount between ₹1 and {formatINR(row.nettDue)}.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={`mode-${row.id}`} className={labelClass}>
              Payment Mode
            </label>
            <select
              id={`mode-${row.id}`}
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
            >
              {pending ? "Saving…" : "Save Payment"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
