"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import type { AppointmentStatus } from "@/lib/types";
import {
  confirmAppointment,
  arriveAppointment,
  inChairAppointment,
  completeAppointment,
  noShowAppointment,
  cancelAppointment,
  rescheduleAppointment,
  type ApptActionState,
} from "./actions";

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-60";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnSuccess = `${btnBase} bg-success text-white hover:bg-success/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;
const btnDanger = `${btnBase} text-danger hover:bg-danger/5`;

export function AppointmentActions({
  id,
  status,
  isPast,
}: {
  id: string;
  status: AppointmentStatus;
  isPast: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  function run(
    fn: () => Promise<ApptActionState>,
    successMsg?: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        toast(res.error);
        return;
      }
      if (successMsg) toast(successMsg);
      router.refresh();
    });
  }

  const canConfirm = status === "scheduled";
  const canArrive = status === "confirmed";
  const canInChair = status === "arrived";
  const canComplete = status === "arrived" || status === "in_chair";
  const canNoShow =
    (status === "scheduled" || status === "confirmed") && isPast;
  const canCancel = status === "scheduled" || status === "confirmed";
  const canReschedule = status !== "completed";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canConfirm ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => run(() => confirmAppointment(id), "Confirmed")}
        >
          Confirm
        </button>
      ) : null}

      {canArrive ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => run(() => arriveAppointment(id), "Marked arrived")}
        >
          Arrived
        </button>
      ) : null}

      {canInChair ? (
        <button
          className={btnPrimary}
          disabled={pending}
          onClick={() => run(() => inChairAppointment(id), "In chair")}
        >
          In Chair
        </button>
      ) : null}

      {canComplete ? (
        <button
          className={btnSuccess}
          disabled={pending}
          // completeAppointment redirects to the visit log on success.
          onClick={() => run(() => completeAppointment(id))}
        >
          Complete
        </button>
      ) : null}

      {canReschedule ? (
        <button
          className={btnOutline}
          disabled={pending}
          onClick={() => setRescheduleOpen(true)}
        >
          Reschedule
        </button>
      ) : null}

      {canCancel ? (
        <button
          className={btnOutline}
          disabled={pending}
          onClick={() => {
            if (window.confirm("Cancel this appointment?")) {
              run(() => cancelAppointment(id), "Appointment cancelled");
            }
          }}
        >
          Cancel
        </button>
      ) : null}

      {canNoShow ? (
        <button
          className={btnDanger}
          disabled={pending}
          onClick={() => run(() => noShowAppointment(id), "Marked no-show")}
        >
          No Show
        </button>
      ) : null}

      <Modal
        open={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Reschedule Appointment"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`rd-${id}`} className="mb-1.5 block text-sm font-medium text-text-primary">
                New date
              </label>
              <input
                id={`rd-${id}`}
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label htmlFor={`rt-${id}`} className="mb-1.5 block text-sm font-medium text-text-primary">
                New time
              </label>
              <input
                id={`rt-${id}`}
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setRescheduleOpen(false)}
              className={`${btnOutline} flex-1`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={pending || !newDate || !newTime}
              className={`${btnPrimary} flex-1`}
              onClick={() =>
                startTransition(async () => {
                  const res = await rescheduleAppointment(id, newDate, newTime);
                  if (res?.error) {
                    toast(res.error);
                    return;
                  }
                  toast("Rescheduled ✓");
                  setRescheduleOpen(false);
                  // Jump to the new day so the rescheduled slot is visible.
                  router.push(`/appointments?date=${newDate}`);
                })
              }
            >
              Reschedule
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
