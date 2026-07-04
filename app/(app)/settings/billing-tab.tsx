"use client";

import Link from "next/link";
import { formatDate } from "@/lib/format";
import {
  effectiveStatus,
  statusLabel,
  trialDaysLeft,
} from "@/lib/subscription";

export type LedgerRow = {
  id: string;
  created_at: string;
  kind: "content" | "map";
  delta: number;
  reason: string;
  balance_after: number;
};

export type BillingInfo = {
  subscriptionStatus: string | null;
  planName: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  contentBalance: number;
  mapBalance: number;
  ledger: LedgerRow[];
};

const REASON_LABELS: Record<string, string> = {
  trial_grant: "Trial grant",
  topup: "Top-up",
  generation: "Content generation",
  map_scan: "Map scan",
  admin_adjust: "Admin adjustment",
  monthly_reset: "Monthly reset",
  refund: "Refund",
};

function reasonLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason;
}

export function BillingTab({ info }: { info: BillingInfo }) {
  const eff = effectiveStatus(info.subscriptionStatus, info.trialEndsAt);
  const days = trialDaysLeft(info.trialEndsAt);

  let renewalLine = "";
  if (eff === "trial") {
    renewalLine =
      days > 0
        ? `Trial ends ${formatDate(info.trialEndsAt)} (${days} day${days === 1 ? "" : "s"} left)`
        : "Your free trial ends today";
  } else if (eff === "past_due") {
    renewalLine = `Trial ended ${formatDate(info.trialEndsAt)}`;
  } else if (eff === "active" && info.currentPeriodEnd) {
    renewalLine = `Renews ${formatDate(info.currentPeriodEnd)}`;
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="rounded-card border border-border bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-text-secondary">Plan</p>
            <p className="mt-0.5 text-[17px] font-semibold text-text-primary">
              {info.planName ?? "No active plan"}
            </p>
            {renewalLine ? (
              <p className="mt-1 text-sm text-text-secondary">{renewalLine}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-pill bg-subtle px-3 py-1 text-sm font-medium text-text-primary">
              {statusLabel(eff)}
            </span>
            <Link
              href="/upgrade"
              className="flex h-10 items-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
            >
              ⬆ Upgrade
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <div className="rounded-button border border-border bg-subtle/50 p-4">
            <p className="text-sm text-text-secondary">Content credits</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-primary">
              {info.contentBalance}
            </p>
          </div>
          <div className="rounded-button border border-border bg-subtle/50 p-4">
            <p className="text-sm text-text-secondary">Map-scan credits</p>
            <p className="mt-1 text-[24px] font-semibold tracking-[-0.02em] text-text-primary">
              {info.mapBalance}
            </p>
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Credit history
        </h2>
        {info.ledger.length === 0 ? (
          <div className="rounded-card border border-border bg-white p-8 text-center">
            <p className="text-sm text-text-secondary">No credit activity yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-white">
            {info.ledger.map((row) => {
              const positive = row.delta >= 0;
              return (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {reasonLabel(row.reason)}
                      <span className="ml-2 rounded-pill bg-subtle px-2 py-0.5 text-xs font-normal text-text-secondary">
                        {row.kind === "content" ? "Content" : "Map"}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {formatDate(row.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold ${
                        positive ? "text-success" : "text-text-primary"
                      }`}
                    >
                      {positive ? "+" : ""}
                      {row.delta}
                    </p>
                    <p className="mt-0.5 text-xs text-text-secondary">
                      balance {row.balance_after}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
