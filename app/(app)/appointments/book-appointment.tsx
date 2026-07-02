"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import type { PatientOption, RateCardOption } from "@/lib/types";
import { bookAppointment, type ApptActionState } from "./actions";

const initialState: ApptActionState = {};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

function PatientCombobox({
  patients,
  onSelect,
}: {
  patients: PatientOption[];
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<PatientOption | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients.slice(0, 8);
    const digits = q.replace(/\D/g, "");
    return patients
      .filter((p) => {
        const nameMatch = p.full_name.toLowerCase().includes(q);
        const phoneMatch =
          digits.length > 0 &&
          `${p.whatsapp_number ?? ""}${p.phone ?? ""}`.includes(digits);
        return nameMatch || phoneMatch;
      })
      .slice(0, 8);
  }, [patients, query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function choose(p: PatientOption) {
    setSelected(p);
    setQuery(p.full_name);
    onSelect(p.id);
    setOpen(false);
  }

  return (
    <div className="relative" ref={boxRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (selected) {
            setSelected(null);
            onSelect("");
          }
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search patient by name or phone"
        className={inputClass}
        autoComplete="off"
      />
      {open && filtered.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-button border border-border bg-white py-1 shadow-sm">
          {filtered.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => choose(p)}
                className="flex min-h-[44px] w-full flex-col items-start px-3 py-2 text-left hover:bg-subtle"
              >
                <span className="text-[15px] text-text-primary">
                  {p.full_name}
                </span>
                <span className="text-sm text-text-secondary">
                  {p.whatsapp_number ?? p.phone ?? ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open && query.trim() && filtered.length === 0 ? (
        <div className="absolute z-10 mt-1 w-full rounded-button border border-border bg-white px-3 py-2 text-sm text-text-secondary shadow-sm">
          No patients found.
        </div>
      ) : null}
    </div>
  );
}

export function BookAppointment({
  open,
  onClose,
  patients,
  rateCards,
  defaultDate,
  defaultDoctor,
}: {
  open: boolean;
  onClose: () => void;
  patients: PatientOption[];
  rateCards: RateCardOption[];
  defaultDate: string;
  defaultDoctor: string;
}) {
  const [state, formAction] = useFormState(bookAppointment, initialState);
  const [patientId, setPatientId] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (open) setPatientId("");
  }, [open]);

  useEffect(() => {
    if (state.ok) {
      toast("Appointment booked ✓");
      onClose();
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Modal open={open} onClose={onClose} title="Book Appointment">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="patient_id" value={patientId} />

        {state.error ? (
          <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        ) : null}

        <div>
          <label className={labelClass}>
            Patient <span className="text-danger">*</span>
          </label>
          <PatientCombobox patients={patients} onSelect={setPatientId} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="appointment_date" className={labelClass}>
              Date <span className="text-danger">*</span>
            </label>
            <input
              id="appointment_date"
              name="appointment_date"
              type="date"
              required
              defaultValue={defaultDate}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="appointment_time" className={labelClass}>
              Time <span className="text-danger">*</span>
            </label>
            <input
              id="appointment_time"
              name="appointment_time"
              type="time"
              required
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="treatment_type_id" className={labelClass}>
            Treatment
          </label>
          <select
            id="treatment_type_id"
            name="treatment_type_id"
            defaultValue=""
            className={inputClass}
          >
            <option value="">No treatment yet</option>
            {rateCards.map((rc) => (
              <option key={rc.id} value={rc.id}>
                {rc.treatment_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="doctor" className={labelClass}>
            Doctor
          </label>
          <input
            id="doctor"
            name="doctor"
            type="text"
            defaultValue={defaultDoctor}
            className={inputClass}
            placeholder="Doctor name"
          />
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={2}
            className="w-full rounded-button border border-border px-3 py-2 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            Cancel
          </button>
          <div className="flex-1">
            <SubmitButton pendingText="Booking…" disabled={!patientId}>
              Book
            </SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
