"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { NOTE_STATUS_FILTERS } from "@/lib/note-status";

// Client filter controls for the /notes inbox. Purely URL-driven: every change
// rewrites the query string and lets the server component re-query. The
// `patient` param (a deep-link from a profile) is always preserved so narrowing
// by status/date/name never drops the patient scope.

export function NotesFilterBar({
  status,
  date,
  q,
}: {
  status: string;
  date: string;
  q: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [query, setQuery] = useState(q);

  const push = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div className="mt-5 space-y-3">
      {/* Status segmented control */}
      <div className="flex flex-wrap gap-2">
        {NOTE_STATUS_FILTERS.map((f) => {
          const active =
            f.value === "all" ? status === "all" : status === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() =>
                push({ status: f.value === "all" ? null : f.value })
              }
              className={`flex h-9 items-center rounded-button px-3 text-sm font-medium ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:bg-subtle"
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Date + name search */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          onChange={(e) => push({ date: e.target.value || null })}
          aria-label="Filter by day"
          className="h-11 rounded-button border border-border bg-white px-3 text-[15px] text-text-primary"
        />
        {date ? (
          <button
            type="button"
            onClick={() => push({ date: null })}
            className="text-sm font-medium text-text-secondary hover:text-text-primary"
          >
            Clear date
          </button>
        ) : null}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            push({ q: query.trim() || null });
          }}
          className="flex flex-1 items-center gap-2"
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patient name…"
            aria-label="Search by patient name"
            className="h-11 min-w-0 flex-1 rounded-button border border-border bg-white px-3 text-[15px] text-text-primary sm:max-w-xs"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            Search
          </button>
        </form>
      </div>
    </div>
  );
}
