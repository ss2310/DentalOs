import Link from "next/link";
import { requireAdminContext } from "@/lib/admin/auth";
import { formatDate, formatRelativeTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type Overview = {
  id: string;
  business_name: string | null;
  vertical: string | null;
  created_at: string;
  is_active: boolean;
  feature_flags: Record<string, unknown> | null;
  user_count: number | string;
  last_activity: string | null;
};

// Subscription status → pill styling. Indigo is the admin accent; the semantic
// tokens (success/warning/danger) still read the same.
const STATUS_BADGE: Record<string, string> = {
  trial: "bg-[#4F46E5]/10 text-[#4F46E5]",
  active: "bg-success/10 text-success",
  past_due: "bg-warning/10 text-warning",
  deactivated: "bg-danger/10 text-danger",
  cancelled: "bg-black/5 text-text-secondary",
};

export default async function AdminClinicsPage() {
  // requireAdminContext re-verifies super-admin, THEN gives the service-role
  // client for these cross-tenant reads.
  const { db } = await requireAdminContext();

  const [{ data: overview }, { data: subs }] = await Promise.all([
    db.rpc("admin_clinics_overview"),
    // Subscription status lives in 019's columns; the overview fn stays
    // 019-independent, so enrich here with a direct service-role select.
    db.from("clinics").select("id, subscription_status"),
  ]);

  const clinics = (overview as Overview[] | null) ?? [];
  const statusById = new Map(
    ((subs as { id: string; subscription_status: string }[] | null) ?? []).map(
      (s) => [s.id, s.subscription_status],
    ),
  );

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          Clinics
        </h1>
        <span className="text-sm text-text-secondary">
          {clinics.length} total
        </span>
      </div>

      <div className="mt-5 overflow-x-auto rounded-card border border-border bg-white shadow-card">
        <table className="w-full min-w-[720px] text-left text-[15px]">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
              <th className="px-4 py-3 font-medium">Clinic</th>
              <th className="px-4 py-3 font-medium">Vertical</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3 text-right font-medium">Users</th>
              <th className="px-4 py-3 font-medium">Last activity</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {clinics.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-text-secondary"
                >
                  No clinics yet.
                </td>
              </tr>
            ) : (
              clinics.map((c) => {
                const status = statusById.get(c.id) ?? "—";
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
                    <td className="px-4 py-3 capitalize text-text-secondary">
                      {c.vertical ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {formatDate(c.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-text-secondary">
                      {Number(c.user_count)}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {c.last_activity ? formatRelativeTime(c.last_activity) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-medium capitalize ${
                          STATUS_BADGE[status] ?? "bg-black/5 text-text-secondary"
                        }`}
                      >
                        {status.replace("_", " ")}
                      </span>
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
