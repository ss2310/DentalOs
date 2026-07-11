"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PlusIcon } from "@/components/icons";
import type { PatientOption, RateCardOption } from "@/lib/types";
import { BookAppointment } from "./book-appointment";

const tabBase =
  "flex h-11 items-center rounded-button px-4 text-[15px] font-medium";
const tabActive = `${tabBase} bg-primary/10 text-primary`;
const tabIdle = `${tabBase} text-text-secondary hover:bg-subtle`;

export type ScheduleView = "list" | "day" | "week";

export function AppointmentsToolbar({
  today,
  tomorrow,
  selected,
  view,
  patients,
  rateCards,
  doctorName,
}: {
  today: string;
  tomorrow: string;
  selected: string;
  view: ScheduleView;
  patients: PatientOption[];
  rateCards: RateCardOption[];
  doctorName: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bookOpen, setBookOpen] = useState(false);

  // Global "+ New → Book Appointment" lands here with ?book=1 — open the modal.
  useEffect(() => {
    if (searchParams.get("book") === "1") setBookOpen(true);
  }, [searchParams]);

  const isCustom = selected !== today && selected !== tomorrow;

  function go(date: string) {
    router.push(`/appointments?date=${date}&view=${view}`);
  }

  function goView(v: ScheduleView) {
    router.push(`/appointments?date=${selected}&view=${v}`);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-primary">
          Appointments
        </h1>
        <button
          type="button"
          onClick={() => setBookOpen(true)}
          className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
        >
          <PlusIcon />
          <span className="hidden sm:inline">Book Appointment</span>
          <span className="sm:hidden">Book</span>
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => go(today)}
          className={selected === today ? tabActive : tabIdle}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => go(tomorrow)}
          className={selected === tomorrow ? tabActive : tabIdle}
        >
          Tomorrow
        </button>
        <input
          type="date"
          value={selected}
          onChange={(e) => e.target.value && go(e.target.value)}
          aria-label="Pick a date"
          className={`h-11 rounded-button border px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
            isCustom
              ? "border-primary text-primary"
              : "border-border text-text-primary"
          }`}
        />

        {/* View toggle: list (default) | day grid | week grid */}
        <div className="ml-auto flex h-11 overflow-hidden rounded-button border border-border">
          {(
            [
              { id: "list", label: "List" },
              { id: "day", label: "Day" },
              { id: "week", label: "Week" },
            ] as const
          ).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => goView(v.id)}
              aria-pressed={view === v.id}
              className={`flex h-full items-center px-3.5 text-sm font-medium ${
                view === v.id
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:bg-subtle"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <BookAppointment
        open={bookOpen}
        onClose={() => setBookOpen(false)}
        patients={patients}
        rateCards={rateCards}
        defaultDate={selected}
        defaultDoctor={doctorName}
      />
    </div>
  );
}
