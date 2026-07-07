"use client";

import { useState, useTransition } from "react";
import { setClinicVertical } from "./actions";

// Clinic vertical picker (multi-vertical UI only — the parent renders this solely
// when ENABLE_MULTI_VERTICAL is on). Lists the active verticals and saves the
// choice via the set_clinic_vertical definer action. With only 'dental' active
// it's a single-option dropdown, which is the intended "flag on, dental-only"
// state: visible but a no-op.

export function VerticalSelector({
  current,
  options,
}: {
  current: string;
  options: { id: string; display_name: string }[];
}) {
  const [value, setValue] = useState(current);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const onChange = (next: string) => {
    const prev = value;
    setValue(next); // optimistic
    setMsg(null);
    startTransition(async () => {
      const res = await setClinicVertical(next);
      if (res.error) {
        setValue(prev); // revert
        setMsg({ ok: false, text: res.error });
      } else {
        setMsg({ ok: true, text: "Vertical updated." });
      }
    });
  };

  return (
    <div className="mb-6 rounded-card border border-border bg-white p-5">
      <label
        htmlFor="clinic-vertical"
        className="block text-[15px] font-semibold text-text-primary"
      >
        Clinic vertical
      </label>
      <p className="mt-1 text-sm text-text-secondary">
        The type of clinic this is. It decides which content templates and topic
        suggestions you get. Most clinics never change this.
      </p>
      <select
        id="clinic-vertical"
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className="mt-3 h-11 w-full max-w-xs rounded-button border border-border bg-white px-3 text-[15px] text-text-primary disabled:opacity-50"
      >
        {options.length === 0 ? (
          <option value={current}>{current}</option>
        ) : (
          options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.display_name}
            </option>
          ))
        )}
      </select>
      {msg ? (
        <p
          className={`mt-2 text-sm font-medium ${
            msg.ok ? "text-success" : "text-danger"
          }`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
