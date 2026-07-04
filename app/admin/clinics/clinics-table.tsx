"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, formatRelativeTime } from "@/lib/format";

export type ClinicRow = {
  id: string;
  business_name: string | null;
  owner_email: string | null;
  subscription_status: string | null;
  plan_name: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  content_credits_balance: number | null;
  map_credits_balance: number | null;
  created_at: string;
  last_activity: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  trial: "bg-[#4F46E5]/10 text-[#4F46E5]",
  active: "bg-success/10 text-success",
  past_due: "bg-warning/10 text-warning",
  deactivated: "bg-danger/10 text-danger",
  cancelled: "bg-black/5 text-text-secondary",
};

const STATUS_ORDER: Record<string, number> = {
  past_due: 0,
  trial: 1,
  active: 2,
  deactivated: 3,
  cancelled: 4,
};

type SortKey = "signup" | "status" | "renewal";

// The date a clinic renews/expires: trial end while on trial/past_due, else the
// paid period end. Used for the "red if past" column + the renewal sort.
function renewalDate(c: ClinicRow): string | null {
  if (c.subscription_status === "trial" || c.subscription_status === "past_due") {
    return c.trial_ends_at;
  }
  return c.current_period_end;
}

export function ClinicsTable({ rows }: { rows: ClinicRow[] }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortKey>("signup");

  const now = Date.now();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = rows.filter((c) => {
      if (status !== "all" && c.subscription_status !== status) return false;
      if (!q) return true;
      return (
        (c.business_name ?? "").toLowerCase().includes(q) ||
        (c.owner_email ?? "").toLowerCase().includes(q)
      );
    });
    out.sort((a, b) => {
      if (sort === "signup") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sort === "status") {
        return (
          (STATUS_ORDER[a.subscription_status ?? ""] ?? 9) -
          (STATUS_ORDER[b.subscription_status ?? ""] ?? 9)
        );
      }
      // renewal — soonest first, nulls last
      const da = renewalDate(a);
      const db = renewalDate(b);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return new Date(da).getTime() - new Date(db).getTime();
    });
    return out;
  }, [rows, search, status, sort]);

  const controlClass =
    "h-10 rounded-button border border-border bg-white px-3 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-[#4F46E5]/20";

  return (
    <div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or owner email…"
          className={`${controlClass} min-w-[220px] flex-1`}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={controlClass}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="trial">Trial</option>
          <option value="active">Active</option>
          <option value="past_due">Past due</option>
          <option value="deactivated">Deactivated</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className={controlClass}
          aria-label="Sort by"
        >
          <option value="signup">Newest signups</option>
          <option value="status">Status</option>
          <option value="renewal">Renewal date</option>
        </select>
      </div>

      <div className="mt-4 overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <table className="w-full min-w-[900px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-medium">Clinic</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Trial / renewal</th>
              <th className="px-4 py-3 text-right font-medium">Content</th>
              <th className="px-4 py-3 text-right font-medium">Map</th>
              <th className="px-4 py-3 font-medium">Signed up</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-text-secondary">
                  No clinics match.
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const st = c.subscription_status ?? "—";
                const rd = renewalDate(c);
                const overdue = rd ? new Date(rd).getTime() < now : false;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-border last:border-0 hover:bg-subtle"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/clinics/${c.id}`}
                        className="font-medium text-[#4F46E5] hover:underline"
                      >
                        {c.business_name ?? "Unnamed clinic"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.owner_email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-medium capitalize ${
                          STATUS_BADGE[st] ?? "bg-black/5 text-text-secondary"
                        }`}
                      >
                        {st.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.plan_name ?? "—"}
                    </td>
                    <td
                      className={`px-4 py-3 ${overdue ? "font-medium text-danger" : "text-text-secondary"}`}
                    >
                      {rd ? formatDate(rd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {c.content_credits_balance ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {c.map_credits_balance ?? 0}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.last_activity ? formatRelativeTime(c.last_activity) : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
