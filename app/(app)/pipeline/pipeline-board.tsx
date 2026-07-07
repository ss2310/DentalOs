"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { formatINR, formatDate } from "@/lib/format";
import { PIPELINE_STAGE, type PipelineStage } from "@/lib/pipeline-stage";
import type { PatientOption, RateCardOption } from "@/lib/types";
import { BookAppointment } from "@/app/(app)/appointments/book-appointment";
import {
  presentCase,
  acceptCase,
  thinkingCase,
  rejectCase,
  markCaseScheduled,
  type CaseActionState,
} from "./actions";

export type BoardCase = {
  id: string;
  patientId: string;
  patientName: string;
  patientWhatsapp: string | null;
  treatmentName: string;
  planValue: number;
  stage: PipelineStage;
  followUpDate: string | null;
};

// The five active columns, left → right. completed/rejected live in the footer.
const COLUMNS: PipelineStage[] = [
  "identified",
  "presented",
  "thinking",
  "accepted",
  "scheduled",
];

const REJECT_REASONS = ["Too expensive", "Not ready", "Going elsewhere", "Other"];

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-60";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;

// --- Stage rules: what a drag from → to means. Mirrors the button flows and
// the guards in actions.ts. Popup kinds defer to the same modals the buttons
// use; "invalid" snaps back (no server change) with an explaining toast. ---
type MovePlan =
  | { kind: "present" | "accept" | "thinking" | "reject" | "book" | "noop" }
  | { kind: "invalid"; error: string };

function planMove(from: PipelineStage, to: PipelineStage): MovePlan {
  if (from === to) return { kind: "noop" };
  if (from === "identified" && to === "presented") return { kind: "present" };
  if ((from === "presented" || from === "thinking") && to === "accepted")
    return { kind: "accept" };
  if (from === "presented" && to === "thinking") return { kind: "thinking" };
  if ((from === "presented" || from === "thinking") && to === "rejected")
    return { kind: "reject" };
  if (from === "accepted" && to === "scheduled") return { kind: "book" };
  return { kind: "invalid", error: invalidReason(from, to) };
}

function invalidReason(from: PipelineStage, to: PipelineStage): string {
  if (to === "identified") return "Cases can't move back to Identified.";
  if (from === "scheduled") return "This case is already booked — it can't move.";
  if (from === "identified") return "Present this case before moving it further.";
  if (to === "scheduled") return "Accept the case first, then Book to schedule it.";
  if (to === "thinking") return "Only a presented case can be marked Thinking.";
  if (to === "presented") return "Cases don't move back to Presented.";
  if (to === "rejected") return "Only a presented or thinking case can be rejected.";
  if (to === "accepted") return "Only a presented or thinking case can be accepted.";
  return "That move isn't allowed.";
}

export function PipelineBoard({
  cases,
  patients,
  rateCards,
  doctorName,
  today,
}: {
  cases: BoardCase[];
  patients: PatientOption[];
  rateCards: RateCardOption[];
  doctorName: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);

  // Popups reuse the exact button flows, parameterised by the dragged case.
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [reason, setReason] = useState(REJECT_REASONS[0]);
  const [rejectNotes, setRejectNotes] = useState("");

  const pendingCase = cases.find((c) => c.id === pendingId) ?? null;

  function run(fn: () => Promise<CaseActionState>, msg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(msg);
      router.refresh();
    });
  }

  function handleDrop(id: string, to: PipelineStage) {
    const c = cases.find((x) => x.id === id);
    if (!c) return;
    const plan = planMove(c.stage, to);
    switch (plan.kind) {
      case "noop":
        return;
      case "invalid":
        toast(plan.error);
        return;
      case "present":
        run(() => presentCase(id), "Marked presented");
        return;
      case "accept":
        run(() => acceptCase(id), "Case accepted");
        return;
      case "thinking":
        setPendingId(id);
        setFollowUpDate("");
        setThinkingOpen(true);
        return;
      case "reject":
        setPendingId(id);
        setReason(REJECT_REASONS[0]);
        setRejectNotes("");
        setRejectOpen(true);
        return;
      case "book":
        setPendingId(id);
        setBookOpen(true);
        return;
    }
  }

  // Shared drop-zone handlers for a column / footer target `stage`.
  const zoneProps = (stage: PipelineStage) => ({
    onDragOver: (e: React.DragEvent) => {
      if (dragId) {
        e.preventDefault();
        setOverStage(stage);
      }
    },
    onDragLeave: () => setOverStage((s) => (s === stage ? null : s)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain") || dragId;
      setOverStage(null);
      setDragId(null);
      if (id) handleDrop(id, stage);
    },
  });

  const renderCard = (c: BoardCase) => {
    const past = !!c.followUpDate && c.followUpDate < today;
    return (
      <div
        key={c.id}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", c.id);
          e.dataTransfer.effectAllowed = "move";
          setDragId(c.id);
        }}
        onDragEnd={() => {
          setDragId(null);
          setOverStage(null);
        }}
        className={`cursor-grab rounded-lg border border-border bg-white p-3 shadow-card active:cursor-grabbing ${
          dragId === c.id ? "opacity-50" : ""
        }`}
      >
        <p className="text-sm font-medium text-text-primary">{c.patientName}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{c.treatmentName}</p>
        <p className="mt-1 text-sm font-semibold tracking-[-0.01em] text-text-primary">
          {formatINR(c.planValue)}
        </p>
        {c.followUpDate ? (
          <p
            className={`mt-1 text-xs ${
              past ? "font-medium text-danger" : "text-text-secondary"
            }`}
          >
            Follow-up: {formatDate(c.followUpDate)}
          </p>
        ) : null}
      </div>
    );
  };

  const completed = cases.filter((c) => c.stage === "completed");
  const rejected = cases.filter((c) => c.stage === "rejected");
  const sumValue = (list: BoardCase[]) =>
    list.reduce((s, c) => s + c.planValue, 0);

  return (
    <div>
      <p className="mb-3 text-sm text-text-secondary">
        Drag a case between columns to update it.{" "}
        <span className="hidden sm:inline">
          Some moves ask for a follow-up date, a reason, or a booking.
        </span>
      </p>

      {/* Columns — horizontally swipeable on mobile, distributed on desktop. */}
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3 sm:snap-none">
        {COLUMNS.map((stage) => {
          const items = cases.filter((c) => c.stage === stage);
          const total = sumValue(items);
          const active = overStage === stage;
          return (
            <section
              key={stage}
              {...zoneProps(stage)}
              className={`flex w-[78vw] max-w-[280px] shrink-0 snap-start flex-col rounded-card border bg-subtle/40 sm:w-auto sm:max-w-none sm:min-w-0 sm:flex-1 ${
                active ? "border-primary ring-2 ring-primary/30" : "border-border"
              }`}
            >
              <header className="border-b border-border px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-text-primary">
                    {PIPELINE_STAGE[stage].label}
                  </span>
                  <span className="rounded-pill bg-white px-2 py-0.5 text-xs font-medium text-text-secondary">
                    {items.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {formatINR(total)}
                </p>
              </header>
              <div className="flex-1 space-y-2 p-2">
                {items.map(renderCard)}
                {items.length === 0 ? (
                  <p className="px-1 py-6 text-center text-xs text-text-secondary/70">
                    Drop here
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      {/* Footer — completed (count only) + rejected (a drop target). */}
      <div className="mt-3 flex flex-wrap gap-3">
        <div className="flex flex-1 items-center justify-between gap-3 rounded-card border border-border bg-white px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">
            {PIPELINE_STAGE.completed.label}
          </span>
          <span className="text-sm text-text-secondary">
            {completed.length} · {formatINR(sumValue(completed))}
          </span>
        </div>
        <div
          {...zoneProps("rejected")}
          className={`flex flex-1 items-center justify-between gap-3 rounded-card border px-4 py-3 ${
            overStage === "rejected"
              ? "border-danger bg-danger/5 ring-2 ring-danger/20"
              : "border-border bg-white"
          }`}
        >
          <span className="text-sm font-medium text-text-secondary">
            {PIPELINE_STAGE.rejected.label}
          </span>
          <span className="text-sm text-text-secondary">
            {rejected.length} · {formatINR(sumValue(rejected))}
          </span>
        </div>
      </div>

      {/* Thinking → follow-up date (same as the List button). */}
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
              disabled={pending || !followUpDate || !pendingId}
              onClick={() =>
                startTransition(async () => {
                  if (!pendingId) return;
                  const res = await thinkingCase(pendingId, followUpDate);
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

      {/* Rejected → reason + notes (same as the List button). */}
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
              disabled={pending || !pendingId}
              onClick={() =>
                startTransition(async () => {
                  if (!pendingId) return;
                  const res = await rejectCase(pendingId, reason, rejectNotes);
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

      {/* Accepted → Scheduled goes through the same Book appointment flow. */}
      {pendingCase ? (
        <BookAppointment
          open={bookOpen}
          onClose={() => setBookOpen(false)}
          patients={patients}
          rateCards={rateCards}
          defaultDate={today}
          defaultDoctor={doctorName}
          initialPatient={{
            id: pendingCase.patientId,
            full_name: pendingCase.patientName,
            whatsapp_number: pendingCase.patientWhatsapp,
            phone: null,
          }}
          onBooked={async () => {
            if (pendingId) await markCaseScheduled(pendingId);
          }}
        />
      ) : null}
    </div>
  );
}
