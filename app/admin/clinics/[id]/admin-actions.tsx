"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { formatINR } from "@/lib/format";
import {
  activatePlan,
  grantCredits,
  extendTrial,
  changePlan,
  setClinicActive,
} from "../actions";

export type PlanChoice = {
  id: string;
  name: string;
  price_inr: number | string;
  content_credits: number;
  map_credits: number;
};

type ActionResult = { ok?: boolean; error?: string };

const cardClass = "rounded-card border border-border bg-white p-5 shadow-card";
const labelClass = "text-sm font-medium text-text-primary";
const inputClass =
  "h-10 w-full rounded-button border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20";
const btnPrimary =
  "flex h-10 items-center justify-center rounded-button bg-[#4F46E5] px-4 text-sm font-medium text-white hover:bg-[#4338CA] disabled:opacity-50";
const btnDanger =
  "flex h-10 items-center justify-center rounded-button bg-danger px-4 text-sm font-medium text-white hover:bg-danger/90 disabled:opacity-50";

export function AdminActions({
  clinicId,
  isActive,
  currentPlanId,
  plans,
}: {
  clinicId: string;
  isActive: boolean;
  currentPlanId: string | null;
  plans: PlanChoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  // Shared plan picker for Activate + Change plan.
  const [planId, setPlanId] = useState(currentPlanId ?? plans[0]?.id ?? "");
  const [creditKind, setCreditKind] = useState<"content" | "map">("content");
  const [creditAmount, setCreditAmount] = useState("");
  const [trialDays, setTrialDays] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [confirmReactivate, setConfirmReactivate] = useState(false);

  function run(key: string, fn: () => Promise<ActionResult>, okMsg: string, after?: () => void) {
    setBusy(key);
    startTransition(async () => {
      const res = await fn();
      setBusy(null);
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(okMsg);
      after?.();
      router.refresh();
    });
  }

  const disabled = (key: string) => pending && busy === key;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Mark as Paid / Activate + Change plan */}
      <div className={cardClass}>
        <p className={labelClass}>Plan</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          Activate a hand-sold clinic (tops up the plan&apos;s credits + sets the
          renewal date), or switch tier without changing credits.
        </p>
        <select
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
          className={`${inputClass} mt-3`}
          aria-label="Plan"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {formatINR(p.price_inr)} · {p.content_credits}c/{p.map_credits}m
            </option>
          ))}
        </select>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!planId || disabled("activate")}
            onClick={() =>
              run("activate", () => activatePlan(clinicId, planId), "Plan activated ✓")
            }
            className={btnPrimary}
          >
            {disabled("activate") ? "…" : "Mark as Paid / Activate"}
          </button>
          <button
            type="button"
            disabled={!planId || disabled("change")}
            onClick={() =>
              run("change", () => changePlan(clinicId, planId), "Plan changed ✓")
            }
            className="flex h-10 items-center justify-center rounded-button border border-border bg-white px-4 text-sm font-medium text-text-primary hover:bg-subtle disabled:opacity-50"
          >
            Change plan only
          </button>
        </div>
      </div>

      {/* Grant credits */}
      <div className={cardClass}>
        <p className={labelClass}>Grant credits</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          Add credits directly (logged as an admin adjustment).
        </p>
        <div className="mt-3 flex gap-2">
          <select
            value={creditKind}
            onChange={(e) => setCreditKind(e.target.value as "content" | "map")}
            className={`${inputClass} w-32`}
            aria-label="Credit kind"
          >
            <option value="content">Content</option>
            <option value="map">Map</option>
          </select>
          <input
            type="number"
            min={1}
            step={1}
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            placeholder="Amount"
            className={inputClass}
          />
          <button
            type="button"
            disabled={disabled("grant")}
            onClick={() => {
              const n = Number(creditAmount);
              if (!Number.isInteger(n) || n <= 0) {
                toast("Enter a whole number greater than zero.");
                return;
              }
              run(
                "grant",
                () => grantCredits(clinicId, creditKind, n),
                "Credits granted ✓",
                () => setCreditAmount(""),
              );
            }}
            className={btnPrimary}
          >
            {disabled("grant") ? "…" : "Grant"}
          </button>
        </div>
      </div>

      {/* Extend trial */}
      <div className={cardClass}>
        <p className={labelClass}>Extend trial</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          Add days to the trial end date.
        </p>
        <div className="mt-3 flex gap-2">
          <input
            type="number"
            min={1}
            step={1}
            value={trialDays}
            onChange={(e) => setTrialDays(e.target.value)}
            placeholder="Days"
            className={inputClass}
          />
          <button
            type="button"
            disabled={disabled("extend")}
            onClick={() => {
              const n = Number(trialDays);
              if (!Number.isInteger(n) || n <= 0) {
                toast("Enter a whole number of days greater than zero.");
                return;
              }
              run(
                "extend",
                () => extendTrial(clinicId, n),
                "Trial extended ✓",
                () => setTrialDays(""),
              );
            }}
            className={btnPrimary}
          >
            {disabled("extend") ? "…" : "Extend"}
          </button>
        </div>
      </div>

      {/* Deactivate / Reactivate */}
      <div className={cardClass}>
        <p className={labelClass}>Account status</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          {isActive
            ? "Deactivating locks the clinic out until reactivated."
            : "This clinic is currently deactivated."}
        </p>
        <div className="mt-3">
          {isActive ? (
            <button
              type="button"
              disabled={disabled("status")}
              onClick={() => setConfirmDeactivate(true)}
              className={btnDanger}
            >
              Deactivate
            </button>
          ) : (
            <button
              type="button"
              disabled={disabled("status")}
              onClick={() => setConfirmReactivate(true)}
              className={btnPrimary}
            >
              Reactivate
            </button>
          )}
        </div>
      </div>

      <Modal
        open={confirmDeactivate}
        onClose={() => setConfirmDeactivate(false)}
        title="Deactivate clinic?"
      >
        <p className="text-[15px] text-text-primary">
          This clinic will lose access to the app until you reactivate it.
          Continue?
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmDeactivate(false)}
            className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled("status")}
            onClick={() =>
              run(
                "status",
                () => setClinicActive(clinicId, false),
                "Clinic deactivated",
                () => setConfirmDeactivate(false),
              )
            }
            className={`${btnDanger} flex-1`}
          >
            {disabled("status") ? "…" : "Deactivate"}
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmReactivate}
        onClose={() => setConfirmReactivate(false)}
        title="Reactivate clinic?"
      >
        <p className="text-[15px] text-text-primary">
          This restores the clinic&apos;s access and sets its status to active.
          Continue?
        </p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={() => setConfirmReactivate(false)}
            className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled("status")}
            onClick={() =>
              run(
                "status",
                () => setClinicActive(clinicId, true),
                "Clinic reactivated ✓",
                () => setConfirmReactivate(false),
              )
            }
            className={`${btnPrimary} flex-1`}
          >
            {disabled("status") ? "…" : "Reactivate"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
