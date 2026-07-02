"use client";

import { useState } from "react";
import { PlusIcon } from "@/components/icons";
import type { PatientOption } from "@/lib/types";
import { AddCaseModal, type RateCard } from "./add-case";

export function PipelineToolbar({
  patients,
  rateCards,
}: {
  patients: PatientOption[];
  rateCards: RateCard[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-text-primary">Pipeline</h1>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
      >
        <PlusIcon />
        <span className="hidden sm:inline">Add Case</span>
        <span className="sm:hidden">Add</span>
      </button>

      <AddCaseModal
        open={open}
        onClose={() => setOpen(false)}
        patients={patients}
        rateCards={rateCards}
      />
    </div>
  );
}
