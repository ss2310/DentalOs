"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import type { LeadStatus } from "@/lib/lead-badges";
import {
  contactLead,
  interestedLead,
  bookLead,
  convertLead,
  lostLead,
  type LeadActionState,
} from "./actions";

export type LeadView = {
  id: string;
  status: LeadStatus;
  contactUrl: string | null;
};

const LOST_REASONS = [
  "Not interested",
  "Too expensive",
  "Went elsewhere",
  "No response",
  "Other",
];

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-60";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnSuccess = `${btnBase} bg-success text-white hover:bg-success/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;
const btnDanger = `${btnBase} text-danger hover:bg-danger/5`;
const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function LeadActions({ view }: { view: LeadView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lostOpen, setLostOpen] = useState(false);
  const [reason, setReason] = useState(LOST_REASONS[0]);

  const { id, status } = view;

  function run(fn: () => Promise<LeadActionState>, msg?: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        toast(res.error);
        return;
      }
      if (msg) toast(msg);
      router.refresh();
    });
  }

  const canContact = status === "new";
  const canInterested = status === "new" || status === "contacted";
  const canBook = status === "interested";
  const canConvert = status === "booked" || status === "interested";
  const canLose = !["converted", "lost"].includes(status);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canContact && view.contactUrl ? (
        <button
          className={`${btnBase} gap-1.5 border border-success/30 bg-success/5 text-success hover:bg-success/10`}
          disabled={pending}
          onClick={() => {
            window.open(view.contactUrl!, "_blank", "noopener,noreferrer");
            run(() => contactLead(id), "Marked contacted");
          }}
        >
          <WhatsAppIcon width={16} height={16} />
          Contact
        </button>
      ) : null}

      {canInterested ? (
        <button
          className={btnOutline}
          disabled={pending}
          onClick={() => run(() => interestedLead(id), "Marked interested")}
        >
          Interested
        </button>
      ) : null}

      {canBook ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => run(() => bookLead(id), "Marked booked")}
        >
          Book
        </button>
      ) : null}

      {canConvert ? (
        <button
          className={btnSuccess}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await convertLead(id);
              if (res?.error || !res.patientId) {
                toast(res.error ?? "Could not convert.");
                return;
              }
              toast("Converted to patient ✓");
              router.push(`/patients/${res.patientId}`);
            })
          }
        >
          Convert
        </button>
      ) : null}

      {canLose ? (
        <button
          className={btnDanger}
          disabled={pending}
          onClick={() => {
            setReason(LOST_REASONS[0]);
            setLostOpen(true);
          }}
        >
          Lost
        </button>
      ) : null}

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Mark Lead Lost"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={inputClass}
            >
              {LOST_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className={`${btnOutline} flex-1`}
              onClick={() => setLostOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btnBase} flex-1 bg-danger text-white hover:bg-danger/90`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await lostLead(id, reason);
                  if (res?.error) {
                    toast(res.error);
                    return;
                  }
                  toast("Marked lost");
                  setLostOpen(false);
                  router.refresh();
                })
              }
            >
              Mark Lost
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
