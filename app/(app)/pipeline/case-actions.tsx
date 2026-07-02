"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { WhatsAppIcon } from "@/components/icons";
import type { PatientOption, RateCardOption } from "@/lib/types";
import type { PipelineStage } from "@/lib/pipeline-stage";
import { BookAppointment } from "@/app/(app)/appointments/book-appointment";
import {
  presentCase,
  acceptCase,
  thinkingCase,
  rejectCase,
  markCaseScheduled,
  followUpCase,
  type CaseActionState,
} from "./actions";

export type CaseView = {
  id: string;
  patientId: string;
  patientName: string;
  patientWhatsapp: string | null;
  stage: PipelineStage;
  followUpDue: boolean;
  followUpUrl: string | null;
};

const REJECT_REASONS = [
  "Too expensive",
  "Not ready",
  "Going elsewhere",
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

export function CaseActions({
  view,
  patients,
  rateCards,
  doctorName,
  today,
}: {
  view: CaseView;
  patients: PatientOption[];
  rateCards: RateCardOption[];
  doctorName: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [rejectNotes, setRejectNotes] = useState("");

  const { id, stage } = view;

  function run(fn: () => Promise<CaseActionState>, msg?: string) {
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

  const canPresent = stage === "identified";
  const canAccept = stage === "presented" || stage === "thinking";
  const canThinking = stage === "presented";
  const canReject = stage === "presented" || stage === "thinking";
  const canBook = stage === "accepted";
  const canFollowUp = stage === "thinking" && view.followUpDue;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPresent ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => run(() => presentCase(id), "Marked presented")}
        >
          Present
        </button>
      ) : null}

      {canAccept ? (
        <button
          className={btnSuccess}
          disabled={pending}
          onClick={() => run(() => acceptCase(id), "Case accepted")}
        >
          Accepted
        </button>
      ) : null}

      {canThinking ? (
        <button
          className={btnOutline}
          disabled={pending}
          onClick={() => {
            setFollowUpDate("");
            setThinkingOpen(true);
          }}
        >
          Thinking
        </button>
      ) : null}

      {canReject ? (
        <button
          className={btnDanger}
          disabled={pending}
          onClick={() => {
            setReason(REJECT_REASONS[0]);
            setRejectNotes("");
            setRejectOpen(true);
          }}
        >
          Rejected
        </button>
      ) : null}

      {canBook ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => setBookOpen(true)}
        >
          Book
        </button>
      ) : null}

      {canFollowUp ? (
        <button
          className={`${btnBase} gap-1.5 border border-success/30 bg-success/5 text-success hover:bg-success/10`}
          disabled={pending}
          onClick={() => {
            if (view.followUpUrl) {
              window.open(view.followUpUrl, "_blank", "noopener,noreferrer");
            }
            run(() => followUpCase(id), "Follow-up sent");
          }}
        >
          <WhatsAppIcon width={16} height={16} />
          Follow Up
        </button>
      ) : null}

      {/* Thinking → follow-up date */}
      <Modal
        open={thinkingOpen}
        onClose={() => setThinkingOpen(false)}
        title="When to follow up?"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Follow-up date
            </label>
            <input
              type="date"
              value={followUpDate}
              min={today}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className={`${btnOutline} flex-1`}
              onClick={() => setThinkingOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btnPrimary} flex-1`}
              disabled={pending || !followUpDate}
              onClick={() =>
                startTransition(async () => {
                  const res = await thinkingCase(id, followUpDate);
                  if (res?.error) {
                    toast(res.error);
                    return;
                  }
                  toast("Marked thinking");
                  setThinkingOpen(false);
                  router.refresh();
                })
              }
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Rejected → reason + notes */}
      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Reject Case"
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
              {REJECT_REASONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-text-primary">
              Notes
            </label>
            <textarea
              rows={2}
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              className="w-full rounded-button border border-border px-3 py-2 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              className={`${btnOutline} flex-1`}
              onClick={() => setRejectOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btnBase} flex-1 bg-danger text-white hover:bg-danger/90`}
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await rejectCase(id, reason, rejectNotes);
                  if (res?.error) {
                    toast(res.error);
                    return;
                  }
                  toast("Case rejected");
                  setRejectOpen(false);
                  router.refresh();
                })
              }
            >
              Reject
            </button>
          </div>
        </div>
      </Modal>

      {/* Book → appointment popup, preselected patient */}
      <BookAppointment
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        patients={patients}
        rateCards={rateCards}
        defaultDate={today}
        defaultDoctor={doctorName}
        initialPatient={{
          id: view.patientId,
          full_name: view.patientName,
          whatsapp_number: view.patientWhatsapp,
          phone: null,
        }}
        onBooked={async () => {
          await markCaseScheduled(id);
        }}
      />
    </div>
  );
}
