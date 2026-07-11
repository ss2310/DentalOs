"use client";

import { useState } from "react";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import type { AppointmentRow, PatientOption, RateCardOption } from "@/lib/types";
import { APPT_STATUS } from "./status";
import { BookAppointment } from "./book-appointment";

// Calendar schedule (day / week) — the view the doctor's old PMS trained him
// on, rebuilt Clinical Minimal. Appointments have a time but no duration, so
// each 30-minute slot CELL holds its appointments as chips; an empty cell is
// a tap-target that opens the booking modal pre-filled with that date + time.
//
// Clinic working hours aren't configurable yet (no columns on clinics) —
// 9:00–21:00 covers the typical Indian dental day. Make this per-clinic
// config when a clinic asks.
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 21;

const SLOTS: string[] = [];
for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
  SLOTS.push(`${String(h).padStart(2, "0")}:00`);
  SLOTS.push(`${String(h).padStart(2, "0")}:30`);
}

/** Round an HH:MM:SS time down to its 30-minute slot key (HH:MM). */
function slotOf(time: string): string {
  const hh = time.slice(0, 2);
  const mm = Number(time.slice(3, 5)) < 30 ? "00" : "30";
  return `${hh}:${mm}`;
}

// Statuses that shouldn't clutter the calendar.
const HIDDEN: ReadonlySet<string> = new Set(["cancelled_patient", "rescheduled"]);

export function ScheduleGrid({
  days,
  appts,
  patients,
  rateCards,
  doctorName,
  today,
}: {
  /** Ordered days to render as columns: [{date: 'YYYY-MM-DD', label: 'Mon 13 Jul'}] */
  days: { date: string; label: string }[];
  appts: AppointmentRow[];
  patients: PatientOption[];
  rateCards: RateCardOption[];
  doctorName: string;
  today: string;
}) {
  const [booking, setBooking] = useState<{ date: string; time: string } | null>(
    null,
  );

  // date|HH:MM → appointments in that slot.
  const bySlot = new Map<string, AppointmentRow[]>();
  for (const a of appts) {
    if (HIDDEN.has(a.status)) continue;
    const key = `${a.appointment_date}|${slotOf(a.appointment_time)}`;
    const list = bySlot.get(key) ?? [];
    list.push(a);
    bySlot.set(key, list);
  }
  // Out-of-hours appointments would silently vanish from the grid — surface
  // them in a strip below instead of losing them.
  const outOfHours = appts.filter((a) => {
    if (HIDDEN.has(a.status)) return false;
    const h = Number(a.appointment_time.slice(0, 2));
    return h < DAY_START_HOUR || h >= DAY_END_HOUR;
  });

  return (
    <div>
      <div className="overflow-x-auto rounded-card border border-border bg-white">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `52px repeat(${days.length}, minmax(${
              days.length > 1 ? "128px" : "220px"
            }, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="sticky top-0 z-10 border-b border-border bg-white" />
          {days.map((d) => (
            <div
              key={d.date}
              className={`sticky top-0 z-10 border-b border-l border-border bg-white px-2 py-2 text-center text-sm font-medium ${
                d.date === today ? "text-primary" : "text-text-secondary"
              }`}
            >
              {d.label}
            </div>
          ))}

          {/* Slot rows */}
          {SLOTS.map((slot) => (
            <SlotRow
              key={slot}
              slot={slot}
              days={days}
              bySlot={bySlot}
              onBook={(date) => setBooking({ date, time: slot })}
            />
          ))}
        </div>
      </div>

      {outOfHours.length > 0 ? (
        <div className="mt-3 rounded-card border border-border bg-white p-4">
          <p className="text-sm font-medium text-text-secondary">
            Outside 9 AM – 9 PM
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {outOfHours.map((a) => (
              <ApptChip key={a.id} appt={a} showDate />
            ))}
          </div>
        </div>
      ) : null}

      {/* Slot-click booking — date + time prefilled from the tapped cell. */}
      <BookAppointment
        open={booking !== null}
        onClose={() => setBooking(null)}
        patients={patients}
        rateCards={rateCards}
        defaultDate={booking?.date ?? days[0]?.date ?? today}
        defaultTime={booking?.time}
        defaultDoctor={doctorName}
      />
    </div>
  );
}

function SlotRow({
  slot,
  days,
  bySlot,
  onBook,
}: {
  slot: string;
  days: { date: string }[];
  bySlot: Map<string, AppointmentRow[]>;
  onBook: (date: string) => void;
}) {
  const isHour = slot.endsWith(":00");
  return (
    <>
      <div
        className={`border-border pr-2 text-right text-xs text-text-secondary ${
          isHour ? "border-t pt-1" : ""
        }`}
      >
        {isHour ? formatTime(`${slot}:00`) : ""}
      </div>
      {days.map((d) => {
        const slotAppts = bySlot.get(`${d.date}|${slot}`) ?? [];
        return (
          <div
            key={d.date}
            className={`min-h-[34px] border-l border-border p-0.5 ${
              isHour ? "border-t" : "border-t border-dashed border-t-border/60"
            }`}
          >
            {slotAppts.length === 0 ? (
              <button
                type="button"
                onClick={() => onBook(d.date)}
                aria-label={`Book ${d.date} ${slot}`}
                className="group flex h-full min-h-[30px] w-full items-center justify-center rounded-[6px] hover:bg-primary/5"
              >
                <span className="text-xs text-primary opacity-0 group-hover:opacity-100">
                  +
                </span>
              </button>
            ) : (
              <div className="space-y-0.5">
                {slotAppts.map((a) => (
                  <ApptChip key={a.id} appt={a} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function ApptChip({ appt, showDate }: { appt: AppointmentRow; showDate?: boolean }) {
  const badge = APPT_STATUS[appt.status];
  return (
    <Link
      href={`/patients/${appt.patient_id}`}
      title={`${formatTime(appt.appointment_time)} · ${
        appt.patient?.full_name ?? "Unknown"
      }${appt.treatment?.treatment_name ? ` · ${appt.treatment.treatment_name}` : ""} · ${badge.label}`}
      className={`block truncate rounded-[6px] px-1.5 py-1 text-xs font-medium leading-tight ${badge.badge} hover:opacity-80`}
    >
      {showDate ? `${appt.appointment_date} ` : ""}
      {formatTime(appt.appointment_time)} {appt.patient?.full_name ?? "Unknown"}
    </Link>
  );
}
