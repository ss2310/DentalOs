"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import type { PatientOption } from "@/lib/types";
import { addCase } from "./actions";

export type RateCard = { id: string; treatment_name: string; base_price: string };

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
                onClick={() => {
                  setSelected(p);
                  setQuery(p.full_name);
                  onSelect(p.id);
                  setOpen(false);
                }}
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
    </div>
  );
}

export function AddCaseModal({
  open,
  onClose,
  patients,
  rateCards,
}: {
  open: boolean;
  onClose: () => void;
  patients: PatientOption[];
  rateCards: RateCard[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState("");
  const [treatmentId, setTreatmentId] = useState("");
  const [planValue, setPlanValue] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPatientId("");
      setTreatmentId("");
      setPlanValue("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  function onTreatmentChange(id: string) {
    setTreatmentId(id);
    const price = rateCards.find((r) => r.id === id)?.base_price;
    if (price !== undefined) setPlanValue(String(Number(price)));
  }

  const valid =
    !!patientId && !!treatmentId && Number(planValue) >= 0 && planValue !== "";

  function save() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      const res = await addCase({
        patient_id: patientId,
        treatment_id: treatmentId,
        plan_value: Number(planValue),
        notes,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Case added ✓");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Case">
      <div className="space-y-4">
        {error ? (
          <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div>
          <label className={labelClass}>
            Patient <span className="text-danger">*</span>
          </label>
          <PatientCombobox patients={patients} onSelect={setPatientId} />
        </div>

        <div>
          <label htmlFor="case_treatment" className={labelClass}>
            Treatment <span className="text-danger">*</span>
          </label>
          <select
            id="case_treatment"
            value={treatmentId}
            onChange={(e) => onTreatmentChange(e.target.value)}
            className={inputClass}
          >
            <option value="">Select treatment…</option>
            {rateCards.map((rc) => (
              <option key={rc.id} value={rc.id}>
                {rc.treatment_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="case_plan_value" className={labelClass}>
            Plan Value (₹)
          </label>
          <input
            id="case_plan_value"
            type="number"
            min={0}
            step="1"
            value={planValue}
            onChange={(e) => setPlanValue(e.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="case_notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="case_notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
          <button
            type="button"
            onClick={save}
            disabled={!valid || pending}
            className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Add Case"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
