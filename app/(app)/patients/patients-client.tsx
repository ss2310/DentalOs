"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SearchIcon, PlusIcon } from "@/components/icons";
import { formatDate, formatINR } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { SectionHeader, EmptyState } from "@/components/page";
import { PatientFormModal } from "./patient-form-modal";

const DAY_MS = 24 * 60 * 60 * 1000;

type LastVisitFilter = "" | "30" | "90" | "over180" | "never";

const LAST_VISIT_OPTIONS: { value: LastVisitFilter; label: string }[] = [
  { value: "", label: "Last visit: any time" },
  { value: "30", label: "Visited in last 30 days" },
  { value: "90", label: "Visited in last 90 days" },
  { value: "over180", label: "Not seen in 180+ days" },
  { value: "never", label: "Never visited" },
];

const selectClass =
  "h-11 rounded-button border border-border bg-white px-3 text-sm font-medium text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

function daysSince(date: string | null): number | null {
  if (!date) return null;
  const t = new Date(date).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / DAY_MS;
}

/** One patient list rendering (desktop table + mobile cards), reused by the
 *  flat view and by every group in the "By treatment" view. */
function PatientList({ patients }: { patients: Patient[] }) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-white md:block">
        <table className="w-full text-left text-[15px]">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Last visit</th>
              <th className="px-4 py-3 text-right font-medium">Outstanding</th>
              <th className="px-4 py-3 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {patients.map((p) => {
              const outstanding = Number(p.total_outstanding) || 0;
              return (
                <tr
                  key={p.id}
                  className="border-b border-border last:border-0 hover:bg-subtle"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/patients/${p.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {p.full_name}
                    </Link>
                    {p.patient_code ? (
                      <span className="ml-1.5 text-xs text-text-secondary">
                        #{p.patient_code}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {p.whatsapp_number ?? p.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-text-secondary">
                    {formatDate(p.last_visit_date)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right ${
                      outstanding > 0
                        ? "font-medium text-danger"
                        : "text-text-secondary"
                    }`}
                  >
                    {formatINR(p.total_outstanding)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {formatINR(p.lifetime_revenue)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {patients.map((p) => {
          const outstanding = Number(p.total_outstanding) || 0;
          return (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="block rounded-card border border-border bg-white p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium text-text-primary">
                  {p.full_name}
                  {p.patient_code ? (
                    <span className="ml-1.5 text-xs font-normal text-text-secondary">
                      #{p.patient_code}
                    </span>
                  ) : null}
                </span>
                <span
                  className={`text-sm ${
                    outstanding > 0
                      ? "font-medium text-danger"
                      : "text-text-secondary"
                  }`}
                >
                  {formatINR(p.total_outstanding)}
                </span>
              </div>
              <div className="mt-1 text-sm text-text-secondary">
                {p.whatsapp_number ?? p.phone ?? "—"}
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-text-secondary">
                <span>Last visit: {formatDate(p.last_visit_date)}</span>
                <span>Revenue: {formatINR(p.lifetime_revenue)}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}

export function PatientsClient({
  patients,
  treatmentsByPatient,
  treatmentOptions,
}: {
  patients: Patient[];
  /** patientId → unique treatment names (from visits + pipeline cases). */
  treatmentsByPatient: Record<string, string[]>;
  treatmentOptions: string[];
}) {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [treatment, setTreatment] = useState("");

  // Global "+ New → New Patient" lands here with ?add=1 — open the modal.
  useEffect(() => {
    if (searchParams.get("add") === "1") setAddOpen(true);
  }, [searchParams]);
  const [onlyDue, setOnlyDue] = useState(false);
  const [lastVisit, setLastVisit] = useState<LastVisitFilter>("");
  const [source, setSource] = useState("");
  const [grouped, setGrouped] = useState(false);

  const hasFilters =
    treatment !== "" || onlyDue || lastVisit !== "" || source !== "";

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const p of patients) if (p.referral_source) set.add(p.referral_source);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [patients]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return patients.filter((p) => {
      if (q) {
        const nameMatch = p.full_name.toLowerCase().includes(q);
        const phoneMatch =
          digits.length > 0 &&
          `${p.whatsapp_number ?? ""}${p.phone ?? ""}`.includes(digits);
        if (!nameMatch && !phoneMatch) return false;
      }
      if (treatment && !(treatmentsByPatient[p.id] ?? []).includes(treatment)) {
        return false;
      }
      if (source && p.referral_source !== source) return false;
      if (onlyDue && (Number(p.total_outstanding) || 0) <= 0) return false;
      if (lastVisit) {
        const d = daysSince(p.last_visit_date);
        if (lastVisit === "never" && d !== null) return false;
        if (lastVisit === "30" && (d === null || d > 30)) return false;
        if (lastVisit === "90" && (d === null || d > 90)) return false;
        if (lastVisit === "over180" && (d === null || d <= 180)) return false;
      }
      return true;
    });
  }, [patients, query, treatment, source, onlyDue, lastVisit, treatmentsByPatient]);

  // "By treatment" folders: a patient appears under every treatment they have;
  // patients with none land in a trailing "No treatments yet" group.
  const groups = useMemo(() => {
    if (!grouped) return [];
    const byName = new Map<string, Patient[]>();
    const none: Patient[] = [];
    for (const p of filtered) {
      const names = treatmentsByPatient[p.id] ?? [];
      if (names.length === 0) {
        none.push(p);
        continue;
      }
      for (const n of names) {
        if (treatment && n !== treatment) continue;
        (byName.get(n) ?? byName.set(n, []).get(n)!).push(p);
      }
    }
    const out = Array.from(byName.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    if (none.length > 0 && !treatment) out.push(["No treatments yet", none]);
    return out;
  }, [grouped, filtered, treatmentsByPatient, treatment]);

  function clearFilters() {
    setTreatment("");
    setOnlyDue(false);
    setLastVisit("");
    setSource("");
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-primary">Patients</h1>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
        >
          <PlusIcon />
          <span className="hidden sm:inline">Add Patient</span>
          <span className="sm:hidden">Add</span>
        </button>
      </div>

      <div className="relative mt-5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary">
          <SearchIcon />
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or phone"
          className="h-11 w-full rounded-button border border-border pl-10 pr-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Filter bar — composes with search; every control is a 44px target. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={treatment}
          onChange={(e) => setTreatment(e.target.value)}
          aria-label="Filter by treatment"
          className={`${selectClass} max-w-full`}
        >
          <option value="">All treatments</option>
          {treatmentOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={lastVisit}
          onChange={(e) => setLastVisit(e.target.value as LastVisitFilter)}
          aria-label="Filter by last visit"
          className={selectClass}
        >
          {LAST_VISIT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {sources.length > 0 ? (
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            aria-label="Filter by referral source"
            className={selectClass}
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : null}

        <button
          type="button"
          onClick={() => setOnlyDue((v) => !v)}
          aria-pressed={onlyDue}
          className={`flex h-11 items-center rounded-button border px-3.5 text-sm font-medium ${
            onlyDue
              ? "border-danger/30 bg-danger/5 text-danger"
              : "border-border text-text-secondary hover:bg-subtle"
          }`}
        >
          Outstanding due
        </button>

        {/* View toggle: flat list vs treatment folders. */}
        <div className="flex h-11 overflow-hidden rounded-button border border-border">
          {(
            [
              { id: false, label: "All" },
              { id: true, label: "By treatment" },
            ] as const
          ).map((v) => (
            <button
              key={v.label}
              type="button"
              onClick={() => setGrouped(v.id)}
              aria-pressed={grouped === v.id}
              className={`flex h-full items-center px-3.5 text-sm font-medium ${
                grouped === v.id
                  ? "bg-primary/10 text-primary"
                  : "text-text-secondary hover:bg-subtle"
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {hasFilters ? (
          <button
            type="button"
            onClick={clearFilters}
            className="flex h-11 items-center px-2 text-sm font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {!grouped ? (
        <>
          <SectionHeader hint="Newest first">
            {query.trim() || hasFilters
              ? `${filtered.length} result${filtered.length === 1 ? "" : "s"}`
              : "All Patients"}
          </SectionHeader>

          {filtered.length === 0 ? (
            <EmptyState>
              {patients.length === 0
                ? "No patients yet. Add your first patient."
                : "No patients match your search or filters."}
            </EmptyState>
          ) : (
            <PatientList patients={filtered} />
          )}
        </>
      ) : groups.length === 0 ? (
        <>
          <SectionHeader>By treatment</SectionHeader>
          <EmptyState>
            {patients.length === 0
              ? "No patients yet. Add your first patient."
              : "No patients match your search or filters."}
          </EmptyState>
        </>
      ) : (
        groups.map(([name, members]) => (
          <div key={name}>
            <SectionHeader
              hint={`${members.length} patient${members.length === 1 ? "" : "s"}`}
            >
              {name}
            </SectionHeader>
            <PatientList patients={members} />
          </div>
        ))
      )}

      <PatientFormModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
