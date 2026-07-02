"use client";

import { useState } from "react";
import type { AppointmentRow } from "@/lib/types";
import { AppointmentCard } from "./appointment-card";

// Statuses hidden from the default day view (kept in the DB for audit).
const HIDDEN_STATUSES: AppointmentRow["status"][] = [
  "rescheduled",
  "cancelled_patient",
];

type Item = { appt: AppointmentRow; isPast: boolean };

export function AppointmentsList({
  items,
  dateLabel,
}: {
  items: Item[];
  dateLabel: string;
}) {
  const [showHidden, setShowHidden] = useState(false);

  const active = items.filter(
    (i) => !HIDDEN_STATUSES.includes(i.appt.status),
  );
  const hidden = items.filter((i) => HIDDEN_STATUSES.includes(i.appt.status));

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-border bg-white p-10 text-center">
        <p className="text-[15px] text-text-secondary">
          No appointments for {dateLabel}.
        </p>
      </div>
    );
  }

  return (
    <div>
      {hidden.length > 0 ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="flex h-11 items-center rounded-button px-3 text-sm font-medium text-text-secondary hover:bg-subtle"
          >
            {showHidden ? "Hide" : "Show"} cancelled/rescheduled ({hidden.length})
          </button>
        </div>
      ) : null}

      {active.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-10 text-center">
          <p className="text-[15px] text-text-secondary">
            No active appointments for {dateLabel}.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((i) => (
            <AppointmentCard key={i.appt.id} appt={i.appt} isPast={i.isPast} />
          ))}
        </div>
      )}

      {showHidden && hidden.length > 0 ? (
        <div className="mt-3 space-y-3">
          {hidden.map((i) => (
            <AppointmentCard
              key={i.appt.id}
              appt={i.appt}
              isPast={i.isPast}
              muted
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
