"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import type { PatientOption, RateCardOption } from "@/lib/types";
import { BookAppointment } from "../appointments/book-appointment";

// Dashboard quick action: opens the same booking modal used on /appointments.
// Booking a slot revalidates /appointments; the dashboard refreshes on close.
export function DashboardBookButton({
  patients,
  rateCards,
  defaultDate,
  defaultDoctor,
}: {
  patients: PatientOption[];
  rateCards: RateCardOption[];
  defaultDate: string;
  defaultDoctor: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
      >
        <PlusIcon />
        <span className="hidden sm:inline">Book Appointment</span>
        <span className="sm:hidden">Book</span>
      </button>

      <BookAppointment
        open={open}
        onClose={() => setOpen(false)}
        patients={patients}
        rateCards={rateCards}
        defaultDate={defaultDate}
        defaultDoctor={defaultDoctor}
      />
    </>
  );
}
