"use client";

import { useState } from "react";
import type { Patient } from "@/lib/types";
import { PatientFormModal } from "../patient-form-modal";

export function EditPatientButton({ patient }: { patient: Patient }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
      >
        Edit Patient
      </button>
      <PatientFormModal
        open={open}
        onClose={() => setOpen(false)}
        patient={patient}
      />
    </>
  );
}
