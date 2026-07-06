"use client";

import { useState } from "react";
import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";

export type FeedRow = {
  id: string;
  clinic_id: string;
  clinic_name: string | null;
  item_type: string;
  item_name: string | null;
  amount_inr: number | string;
  source: string;
  status: string;
  cf_id: string | null;
  created_at: string;
  paid_at: string | null;
};

const STATUSES = ["all", "created", "paid", "failed", "expired"] as const;

const STATUS_STYLE: Record<string, string> = {
  paid: "bg-success/10 text-success",
  created: "bg-warning/10 text-warning",
  failed: "bg-danger/10 text-danger",
  expired: "bg-subtle text-text-secondary",
};

export function PaymentsTable({ rows }: { rows: FeedRow[] }) {
  const [status, setStatus] = useState<string>("all");
  const filtered = status === "all" ? rows : rows.filter((r) => r.status === status);

  return (
    <div>
      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-1">
        {STATUSES.map((s) => {
          const active = status === s;
          const count = s === "all" ? rows.length : rows.filter((r) => r.status === s).length;
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-button px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                active
                  ? "bg-[#4F46E5] text-white"
                  : "border border-border bg-white text-text-secondary hover:bg-subtle"
              }`}
            >
              {s} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-card border border-border bg-white p-6 text-center text-sm text-text-secondary">
          No payments in this view.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-white">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-[0.06em] text-text-secondary">
                <th className="px-4 py-3 font-medium">Clinic</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Paid</th>
                <th className="px-4 py-3 font-medium">Cashfree id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clinics/${r.clinic_id}`}
                      className="font-medium text-[#4F46E5] hover:underline"
                    >
                      {r.clinic_name ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-text-primary">
                    {r.item_name ?? "—"}
                    <span className="ml-1 text-xs capitalize text-text-secondary">
                      ({r.item_type})
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-text-primary">
                    {formatINR(r.amount_inr)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-pill bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {r.source === "payment_link" ? "link" : "checkout"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-pill px-2 py-0.5 text-xs font-medium capitalize ${
                        STATUS_STYLE[r.status] ?? "bg-subtle text-text-secondary"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary">{formatDate(r.created_at)}</td>
                  <td className="px-4 py-3 text-text-secondary">
                    {r.paid_at ? formatDate(r.paid_at) : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-text-secondary">
                    {r.cf_id ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
