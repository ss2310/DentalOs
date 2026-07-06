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
  sendPaymentLink,
} from "../actions";

export type PlanChoice = {
  id: string;
  name: string;
  price_inr: number | string;
  content_credits: number;
  map_credits: number;
};

export type PackChoice = {
  id: string;
  name: string;
  price_inr: number | string;
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
  packs,
}: {
  clinicId: string;
  isActive: boolean;
  currentPlanId: string | null;
  plans: PlanChoice[];
  packs: PackChoice[];
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

  // Payment link: "plan:<id>" | "pack:<id>" picker + the generated result.
  const [linkItem, setLinkItem] = useState(
    plans[0] ? `plan:${plans[0].id}` : packs[0] ? `pack:${packs[0].id}` : "",
  );
  const [linkResult, setLinkResult] = useState<{
    linkUrl: string;
    waUrl: string | null;
  } | null>(null);

  function generateLink() {
    const [kind, id] = linkItem.split(":");
    if (kind !== "plan" && kind !== "pack") return;
    setBusy("link");
    setLinkResult(null);
    startTransition(async () => {
      const res = await sendPaymentLink(clinicId, kind, id);
      setBusy(null);
      if (res.error || !res.linkUrl) {
        toast(res.error ?? "Could not create the link.");
        return;
      }
      setLinkResult({ linkUrl: res.linkUrl, waUrl: res.waUrl ?? null });
      toast("Payment link created ✓");
      router.refresh();
    });
  }

  async function copyLink() {
    if (!linkResult) return;
    try {
      await navigator.clipboard.writeText(linkResult.linkUrl);
      toast("Link copied ✓");
    } catch {
      toast("Could not copy — select and copy manually.");
    }
  }

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
      {/* Send Payment Link (full width) */}
      <div className={`${cardClass} lg:col-span-2`}>
        <p className={labelClass}>Send payment link</p>
        <p className="mt-0.5 text-sm text-text-secondary">
          Generate a secure Cashfree link for a plan or pack and send it to the
          owner on WhatsApp. Paid links activate the account automatically.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={linkItem}
            onChange={(e) => {
              setLinkItem(e.target.value);
              setLinkResult(null);
            }}
            className={`${inputClass} sm:max-w-md`}
            aria-label="Payment link item"
          >
            {plans.length > 0 ? (
              <optgroup label="Plans">
                {plans.map((p) => (
                  <option key={p.id} value={`plan:${p.id}`}>
                    {p.name} — {formatINR(p.price_inr)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {packs.length > 0 ? (
              <optgroup label="Credit packs">
                {packs.map((p) => (
                  <option key={p.id} value={`pack:${p.id}`}>
                    {p.name} — {formatINR(p.price_inr)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          <button
            type="button"
            disabled={!linkItem || disabled("link")}
            onClick={generateLink}
            className={btnPrimary}
          >
            {disabled("link") ? "Creating…" : "Create link"}
          </button>
        </div>

        {linkResult ? (
          <div className="mt-3 rounded-button border border-border bg-subtle p-3">
            <p className="break-all text-sm text-text-primary">
              {linkResult.linkUrl}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyLink}
                className="flex h-10 items-center justify-center rounded-button border border-border bg-white px-4 text-sm font-medium text-text-primary hover:bg-subtle"
              >
                Copy link
              </button>
              {linkResult.waUrl ? (
                <a
                  href={linkResult.waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 items-center justify-center rounded-button bg-success px-4 text-sm font-medium text-white hover:bg-success/90"
                >
                  WhatsApp owner
                </a>
              ) : (
                <span className="self-center text-xs text-text-secondary">
                  No owner phone on file — copy the link instead.
                </span>
              )}
            </div>
          </div>
        ) : null}
      </div>

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
