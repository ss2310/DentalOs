"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchIcon, PlusIcon } from "@/components/icons";
import { formatDate, formatINR } from "@/lib/format";
import type { Patient } from "@/lib/types";
import { PatientFormModal } from "./patient-form-modal";

export function PatientsClient({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    const digits = q.replace(/\D/g, "");
    return patients.filter((p) => {
      const nameMatch = p.full_name.toLowerCase().includes(q);
      const phoneMatch =
        digits.length > 0 &&
        `${p.whatsapp_number ?? ""}${p.phone ?? ""}`.includes(digits);
      return nameMatch || phoneMatch;
    });
  }, [patients, query]);

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

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-card border border-border bg-white p-10 text-center">
          <p className="text-[15px] text-text-secondary">
            {patients.length === 0
              ? "No patients yet. Add your first patient."
              : "No patients match your search."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="mt-5 hidden overflow-hidden rounded-card border border-border bg-white md:block">
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
                {filtered.map((p) => {
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
          <div className="mt-5 space-y-3 md:hidden">
            {filtered.map((p) => {
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
      )}

      <PatientFormModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
