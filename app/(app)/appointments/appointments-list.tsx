"use client";

import { useState } from "react";
import type { AppointmentRow } from "@/lib/types";
import { AppointmentCard } from "./appointment-card";
import type { WaAction } from "./wa-actions";

// Statuses kept out of the default day view (still in the DB for audit).
const HIDDEN_STATUSES: AppointmentRow["status"][] = [
  "rescheduled",
  "cancelled_patient",
];

type Item = { appt: AppointmentRow; isPast: boolean; waActions: WaAction[] };

export function AppointmentsList({
  items,
  dateLabel,
}: {
  items: Item[];
  dateLabel: string;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [showHidden, setShowHidden] = useState(false);

  // Completed = done for the day; collapsed so the list stays focused on what
  // still needs attention. Cancelled/rescheduled stay tucked away too.
  const completed = items.filter((i) => i.appt.status === "completed");
  const hidden = items.filter((i) => HIDDEN_STATUSES.includes(i.appt.status));
  const active = items.filter(
    (i) =>
      i.appt.status !== "completed" &&
      !HIDDEN_STATUSES.includes(i.appt.status),
  );

  if (items.length === 0) {
    return (
      <div className="rounded-card border border-border bg-white p-10 text-center">
        <p className="text-[15px] text-text-secondary">
          No appointments for {dateLabel}. Tap Book to add one — the 24-hour
          WhatsApp reminder is prepared for you automatically.
        </p>
      </div>
    );
  }

  const toggleClass =
    "flex h-11 items-center rounded-button px-3 text-sm font-medium text-text-secondary hover:bg-subtle";

  return (
    <div>
      {completed.length > 0 || hidden.length > 0 ? (
        <div className="mb-3 flex flex-wrap justify-end gap-2">
          {completed.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className={toggleClass}
            >
              {showCompleted ? "Hide" : "Show"} completed ({completed.length})
            </button>
          ) : null}
          {hidden.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowHidden((v) => !v)}
              className={toggleClass}
            >
              {showHidden ? "Hide" : "Show"} cancelled/rescheduled ({hidden.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {active.length === 0 ? (
        <div className="rounded-card border border-border bg-white p-10 text-center">
          <p className="text-[15px] text-text-secondary">
            {completed.length > 0
              ? `All ${completed.length} appointment${
                  completed.length === 1 ? "" : "s"
                } for ${dateLabel} are done ✓`
              : `No active appointments for ${dateLabel}.`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((i) => (
            <AppointmentCard
              key={i.appt.id}
              appt={i.appt}
              isPast={i.isPast}
              waActions={i.waActions}
            />
          ))}
        </div>
      )}

      {showCompleted && completed.length > 0 ? (
        <div className="mt-3 space-y-3">
          {completed.map((i) => (
            <AppointmentCard
              key={i.appt.id}
              appt={i.appt}
              isPast={i.isPast}
              waActions={i.waActions}
              muted
            />
          ))}
        </div>
      ) : null}

      {showHidden && hidden.length > 0 ? (
        <div className="mt-3 space-y-3">
          {hidden.map((i) => (
            <AppointmentCard
              key={i.appt.id}
              appt={i.appt}
              isPast={i.isPast}
              waActions={i.waActions}
              muted
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
