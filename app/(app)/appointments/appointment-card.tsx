"use client";

import Link from "next/link";
import { formatTime } from "@/lib/format";
import type { AppointmentRow } from "@/lib/types";
import { APPT_STATUS } from "./status";
import { AppointmentActions } from "./appointment-actions";
import { WhatsAppActions } from "./whatsapp-actions";
import type { WaAction } from "./wa-actions";

export function AppointmentCard({
  appt,
  isPast,
  waActions,
  muted = false,
}: {
  appt: AppointmentRow;
  isPast: boolean;
  waActions: WaAction[];
  // Cancelled/rescheduled rows: greyed out, no status-transition buttons.
  // WhatsApp actions still render so recovery stays reachable.
  muted?: boolean;
}) {
  const status = APPT_STATUS[appt.status];

  return (
    <div
      className={`rounded-card border border-border bg-white p-4 ${
        muted ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-semibold text-text-primary">
              {formatTime(appt.appointment_time)}
            </span>
            <span
              className={`rounded-pill px-2.5 py-1 text-xs font-medium ${status.badge}`}
            >
              {status.label}
            </span>
          </div>
          <Link
            href={`/patients/${appt.patient_id}`}
            className="mt-1 block font-medium text-primary hover:underline"
          >
            {appt.patient?.full_name ?? "Unknown patient"}
          </Link>
          <p className="mt-0.5 text-sm text-text-secondary">
            {appt.treatment?.treatment_name ?? "No treatment yet"}
            {appt.doctor ? ` · ${appt.doctor}` : ""}
          </p>
        </div>
      </div>

      {waActions.length > 0 ? (
        <div className="mt-3 border-t border-border pt-3">
          <WhatsAppActions id={appt.id} actions={waActions} />
        </div>
      ) : null}

      {muted ? null : (
        <div className="mt-3 border-t border-border pt-3">
          <AppointmentActions
            id={appt.id}
            status={appt.status}
            isPast={isPast}
          />
        </div>
      )}
    </div>
  );
}
