"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string };

// Choose which tracked keyword's latest scan to analyze. Clicking Analyze
// updates the ?k= param and refreshes; the server page then loads that
// keyword's newest scan. Always clickable — re-analyzing the same keyword is
// how you pull in a scan you just ran.
export function KeywordPicker({
  options,
  selectedId,
}: {
  options: Option[];
  selectedId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(selectedId);
  const [pending, startTransition] = useTransition();

  function analyze() {
    startTransition(() => {
      router.push(`/competitors?k=${value}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={pending}
        aria-label="Tracked keyword"
        className="h-11 min-w-0 flex-1 rounded-button border border-border bg-white px-3 text-[15px] text-text-primary disabled:opacity-60 sm:max-w-xs"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={analyze}
        disabled={pending}
        aria-busy={pending}
        className="flex h-11 items-center justify-center gap-2 rounded-button bg-primary px-4 text-[15px] font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-80"
      >
        {pending ? (
          <>
            <Spinner />
            Analyzing…
          </>
        ) : (
          "Analyze latest scan"
        )}
      </button>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
