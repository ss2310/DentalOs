"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { formatDate, formatINR } from "@/lib/format";
import { confirmPayment, cancelPending } from "./actions";

export type PendingRow = {
  id: string;
  created_at: string;
  kind: "Plan" | "Top-up";
  itemName: string;
  clinicName: string;
  amount: number | string | null;
};

export function PendingList({ rows }: { rows: PendingRow[] }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function run(
    fn: (id: string) => Promise<{ ok?: boolean; error?: string }>,
    id: string,
    successMsg: string,
  ) {
    setBusy(id);
    startTransition(async () => {
      const res = await fn(id);
      setBusy(null);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(successMsg);
    });
  }

  if (rows.length === 0) {
    return (
      <div className="mt-5 rounded-card border border-border bg-white p-10 text-center shadow-card">
        <p className="text-[15px] text-text-secondary">
          No pending payments to confirm.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto rounded-card border border-border bg-white shadow-card">
      <table className="w-full min-w-[720px] text-left text-[15px]">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
            <th className="px-4 py-3 font-medium">Clinic</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Item</th>
            <th className="px-4 py-3 text-right font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Requested</th>
            <th className="px-4 py-3 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isBusy = pending && busy === row.id;
            return (
              <tr
                key={row.id}
                className="border-b border-border last:border-0 hover:bg-subtle"
              >
                <td className="px-4 py-3 font-medium text-text-primary">
                  {row.clinicName}
                </td>
                <td className="px-4 py-3 text-text-secondary">{row.kind}</td>
                <td className="px-4 py-3 text-text-secondary">{row.itemName}</td>
                <td className="px-4 py-3 text-right text-text-secondary">
                  {formatINR(row.amount)}
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {formatDate(row.created_at)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        run(confirmPayment, row.id, "Payment confirmed ✓")
                      }
                      className="flex h-9 items-center rounded-button bg-[#4F46E5] px-3 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50"
                    >
                      {isBusy ? "…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() =>
                        run(cancelPending, row.id, "Payment cancelled")
                      }
                      className="flex h-9 items-center rounded-button border border-border bg-white px-3 text-sm font-medium text-text-secondary hover:bg-subtle disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
