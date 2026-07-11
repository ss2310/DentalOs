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

// One line of the plan being built. Price is editable per line (discounts /
// case-specific quotes); it prefills from the rate card on treatment pick.
type PlanLine = { treatment_id: string; qty: string; price: string };

const EMPTY_LINE: PlanLine = { treatment_id: "", qty: "1", price: "" };

export function AddCaseModal({
  open,
  onClose,
  patients,
  rateCards,
  initialPatient,
}: {
  open: boolean;
  onClose: () => void;
  patients: PatientOption[];
  rateCards: RateCard[];
  // When set, the patient is preselected and locked (used from the patient
  // profile) — mirrors BookAppointment's initialPatient.
  initialPatient?: PatientOption;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [patientId, setPatientId] = useState(initialPatient?.id ?? "");
  const [lines, setLines] = useState<PlanLine[]>([EMPTY_LINE]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPatientId(initialPatient?.id ?? "");
      setLines([EMPTY_LINE]);
      setNotes("");
      setError(null);
    }
  }, [open, initialPatient?.id]);

  function setLine(i: number, patch: Partial<PlanLine>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function pickTreatment(i: number, id: string) {
    const price = rateCards.find((r) => r.id === id)?.base_price;
    setLine(i, {
      treatment_id: id,
      ...(price !== undefined ? { price: String(Number(price)) } : {}),
    });
  }

  const lineValid = (l: PlanLine) =>
    !!l.treatment_id &&
    Number.isInteger(Number(l.qty)) &&
    Number(l.qty) >= 1 &&
    l.price !== "" &&
    Number(l.price) >= 0;

  const total = lines.reduce(
    (s, l) => s + (lineValid(l) ? Number(l.qty) * Number(l.price) : 0),
    0,
  );
  const valid = !!patientId && lines.length > 0 && lines.every(lineValid);

  function save() {
    if (!valid) return;
    setError(null);
    startTransition(async () => {
      const res = await addCase({
        patient_id: patientId,
        items: lines.map((l) => ({
          treatment_id: l.treatment_id,
          qty: Number(l.qty),
          price: Number(l.price),
        })),
        notes,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Treatment plan added ✓");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Treatment Plan">
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
          {initialPatient ? (
            <div className="flex h-11 items-center rounded-button border border-border bg-subtle px-3 text-[15px] text-text-primary">
              {initialPatient.full_name}
            </div>
          ) : (
            <PatientCombobox patients={patients} onSelect={setPatientId} />
          )}
        </div>

        <div>
          <label className={labelClass}>
            Treatments <span className="text-danger">*</span>
          </label>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={l.treatment_id}
                  onChange={(e) => pickTreatment(i, e.target.value)}
                  className={`${inputClass} min-w-0 flex-1`}
                  aria-label={`Treatment ${i + 1}`}
                >
                  <option value="">Select treatment…</option>
                  {rateCards.map((rc) => (
                    <option key={rc.id} value={rc.id}>
                      {rc.treatment_name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={99}
                  step={1}
                  value={l.qty}
                  onChange={(e) => setLine(i, { qty: e.target.value })}
                  className={`${inputClass} w-16 shrink-0 px-2 text-center`}
                  aria-label={`Quantity ${i + 1}`}
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={l.price}
                  onChange={(e) => setLine(i, { price: e.target.value })}
                  placeholder="₹"
                  className={`${inputClass} w-24 shrink-0 px-2`}
                  aria-label={`Price ${i + 1}`}
                />
                <button
                  type="button"
                  onClick={() =>
                    setLines((ls) =>
                      ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls,
                    )
                  }
                  disabled={lines.length === 1}
                  aria-label={`Remove line ${i + 1}`}
                  className="flex h-11 w-9 shrink-0 items-center justify-center rounded-button text-text-secondary hover:bg-subtle hover:text-danger disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, EMPTY_LINE])}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            + Add another treatment
          </button>
        </div>

        <div className="flex items-center justify-between rounded-button bg-subtle px-3 py-2.5">
          <span className="text-sm font-medium text-text-secondary">
            Plan total
          </span>
          <span className="text-lg font-semibold tracking-[-0.02em] text-text-primary">
            ₹{total.toLocaleString("en-IN")}
          </span>
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
            {pending ? "Saving…" : "Add Plan"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
