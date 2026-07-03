"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { PlusIcon } from "@/components/icons";
import { LEAD_SOURCES, LEAD_SOURCE_LABEL } from "@/lib/lead-badges";
import { addLead } from "./actions";

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

export function LeadsToolbar() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("walk_in");
  const [interest, setInterest] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setSource("walk_in");
      setInterest("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  function save() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addLead({
        name,
        phone,
        source,
        treatment_interest: interest,
        notes,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Lead added ✓");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold text-text-primary">Enquiries</h1>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
      >
        <PlusIcon />
        <span className="hidden sm:inline">Add Lead</span>
        <span className="sm:hidden">Add</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Lead">
        <div className="space-y-4">
          {error ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="lead_name" className={labelClass}>
              Name <span className="text-danger">*</span>
            </label>
            <input
              id="lead_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="Rahul Verma"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="lead_phone" className={labelClass}>
                Phone
              </label>
              <input
                id="lead_phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="98XXXXXXXX"
              />
            </div>
            <div>
              <label htmlFor="lead_source" className={labelClass}>
                Source
              </label>
              <select
                id="lead_source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className={inputClass}
              >
                {LEAD_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {LEAD_SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="lead_interest" className={labelClass}>
              Treatment interest
            </label>
            <input
              id="lead_interest"
              value={interest}
              onChange={(e) => setInterest(e.target.value)}
              className={inputClass}
              placeholder="e.g. Braces, Implant"
            />
          </div>

          <div>
            <label htmlFor="lead_notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="lead_notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-button border border-border px-3 py-2 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add Lead"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
