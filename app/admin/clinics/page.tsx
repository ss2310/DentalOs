import { requireAdminContext } from "@/lib/admin/auth";
import { ClinicsTable, type ClinicRow } from "./clinics-table";

export const dynamic = "force-dynamic";

export default async function AdminClinicsPage() {
  // requireAdminContext re-verifies super-admin, THEN gives the service-role
  // client for this cross-tenant read (owner email is joined from auth.users
  // inside the definer function).
  const { db } = await requireAdminContext();
  const { data } = await db.rpc("admin_clinics_dashboard");
  const clinics = (data as ClinicRow[] | null) ?? [];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          Clinics
        </h1>
        <span className="text-sm text-text-secondary">{clinics.length} total</span>
      </div>

      <ClinicsTable rows={clinics} />
    </div>
  );
}
