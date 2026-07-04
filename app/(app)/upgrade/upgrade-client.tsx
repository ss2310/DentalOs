"use client";

import { useState, useTransition } from "react";
import { load } from "@cashfreepayments/cashfree-js";
import { toast } from "@/components/toast";
import { SectionHeader } from "@/components/page";
import { formatINR } from "@/lib/format";
import { startCheckout } from "./actions";

export type PlanOption = {
  id: string;
  name: string;
  price_inr: number | string;
  content_credits: number;
  map_credits: number;
  billing_period: string;
};

export type PackOption = {
  id: string;
  name: string;
  price_inr: number | string;
  content_credits: number;
  map_credits: number;
};

function creditLine(content: number, map: number): string {
  const parts: string[] = [];
  if (content > 0) parts.push(`${content} content credits`);
  if (map > 0) parts.push(`${map} map scans`);
  return parts.join(" · ") || "—";
}

export function UpgradeOptions({
  plans,
  packs,
  currentPlanId,
}: {
  plans: PlanOption[];
  packs: PackOption[];
  currentPlanId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function buy(kind: "plan" | "pack", id: string) {
    setBusyId(id);
    setNotice(null);
    startTransition(async () => {
      const res = await startCheckout(kind, id);
      if (res.error) {
        setBusyId(null);
        toast(res.error);
        return;
      }
      // Cashfree: launch hosted checkout with the payment_session_id. The tab
      // redirects to Cashfree and returns to /upgrade/result, so we keep the
      // button busy until the SDK takes over (or errors).
      if (res.sessionId) {
        try {
          const cashfree = await load({ mode: res.mode ?? "sandbox" });
          const result = await cashfree.checkout({
            paymentSessionId: res.sessionId,
            redirectTarget: "_self",
          });
          if (result?.error) {
            setBusyId(null);
            toast(result.error.message ?? "Payment could not be started.");
          }
          // On success the page has navigated to Cashfree — nothing more to do.
        } catch {
          setBusyId(null);
          toast("Could not open checkout. Please try again.");
        }
        return;
      }
      setBusyId(null);
      if (res.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      if (res.message) {
        setNotice(res.message);
        toast("Order placed ✓");
      }
    });
  }

  const buttonClass =
    "mt-4 flex h-11 w-full items-center justify-center rounded-button bg-primary px-4 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-50";

  return (
    <div>
      {notice ? (
        <p className="mt-5 rounded-button border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
          {notice}
        </p>
      ) : null}

      <SectionHeader>Plans</SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plans.length === 0 ? (
          <p className="text-sm text-text-secondary">No plans available yet.</p>
        ) : (
          plans.map((plan) => {
            const isCurrent = plan.id === currentPlanId;
            return (
              <div
                key={plan.id}
                className="rounded-card border border-border bg-white p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
                    {plan.name}
                  </h3>
                  {isCurrent ? (
                    <span className="rounded-pill bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-[26px] font-semibold tracking-[-0.02em] text-text-primary">
                  {formatINR(plan.price_inr)}
                  <span className="text-sm font-normal text-text-secondary">
                    {plan.billing_period === "annual"
                      ? " / year"
                      : plan.billing_period === "monthly"
                        ? " / month"
                        : ""}
                  </span>
                </p>
                <p className="mt-2 text-sm text-text-secondary">
                  {creditLine(plan.content_credits, plan.map_credits)}
                </p>
                <button
                  type="button"
                  disabled={pending && busyId === plan.id}
                  onClick={() => buy("plan", plan.id)}
                  className={buttonClass}
                >
                  {pending && busyId === plan.id ? "Starting…" : "Upgrade"}
                </button>
              </div>
            );
          })
        )}
      </div>

      <SectionHeader>Credit top-ups</SectionHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {packs.length === 0 ? (
          <p className="text-sm text-text-secondary">No top-ups available yet.</p>
        ) : (
          packs.map((pack) => (
            <div
              key={pack.id}
              className="rounded-card border border-border bg-white p-5 shadow-card"
            >
              <h3 className="text-[15px] font-semibold text-text-primary">
                {pack.name}
              </h3>
              <p className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text-primary">
                {formatINR(pack.price_inr)}
              </p>
              <p className="mt-1 text-sm text-text-secondary">
                {creditLine(pack.content_credits, pack.map_credits)}
              </p>
              <button
                type="button"
                disabled={pending && busyId === pack.id}
                onClick={() => buy("pack", pack.id)}
                className={buttonClass}
              >
                {pending && busyId === pack.id ? "Starting…" : "Buy"}
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
