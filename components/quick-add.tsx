"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@/components/icons";

// Global "+ New" — one button that answers "where do I do X?" for staff who
// don't know which module owns which action. Items navigate to the owning
// page; ?add=1 / ?book=1 auto-open the right modal there.
const ITEMS: { label: string; hint: string; href: string }[] = [
  {
    label: "New Patient",
    hint: "Add a patient record",
    href: "/patients?add=1",
  },
  {
    label: "Book Appointment",
    hint: "Schedule a visit",
    href: "/appointments?book=1",
  },
  {
    label: "Log Walk-in Visit",
    hint: "Open the patient, then + Add Treatment",
    href: "/patients",
  },
  {
    label: "Record Payment",
    hint: "Collect a pending balance",
    href: "/billing",
  },
];

export function QuickAdd() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Quick add"
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90 sm:px-3.5"
      >
        <PlusIcon />
        <span className="hidden sm:inline">New</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-64 overflow-hidden rounded-card border border-border bg-white shadow-card"
        >
          {ITEMS.map((item, i) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => go(item.href)}
              className={`flex w-full flex-col items-start px-4 py-3 text-left hover:bg-subtle ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="text-[15px] font-medium text-text-primary">
                {item.label}
              </span>
              <span className="text-sm text-text-secondary">{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
