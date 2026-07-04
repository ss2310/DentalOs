import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/admin/auth";
import { formatDate } from "@/lib/format";
import { FeatureFlagsEditor } from "./feature-flags";

export const dynamic = "force-dynamic";

type Clinic = {
  id: string;
  business_name: string | null;
  doctor_name: string | null;
  vertical: string | null;
  city: string | null;
  area: string | null;
  created_at: string;
  is_active: boolean;
  subscription_status: string | null;
  content_credits_balance: number | null;
  map_credits_balance: number | null;
  feature_flags: Record<string, unknown> | null;
};

type ClinicUser = {
  id: string;
  full_name: string | null;
  role: string;
  is_super_admin: boolean;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-white p-4">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-[-0.02em] text-text-primary">
        {value}
      </p>
    </div>
  );
}

export default async function AdminClinicDetail({
  params,
}: {
  params: { id: string };
}) {
  const { db } = await requireAdminContext();

  const { data: clinicRow } = await db
    .from("clinics")
    .select(
      "id, business_name, doctor_name, vertical, city, area, created_at, is_active, subscription_status, content_credits_balance, map_credits_balance, feature_flags",
    )
    .eq("id", params.id)
    .maybeSingle();
  const clinic = clinicRow as Clinic | null;
  if (!clinic) notFound();

  const [{ data: userRows }, patients, appts, content, scans] = await Promise.all([
    db
      .from("profiles")
      .select("id, full_name, role, is_super_admin")
      .eq("home_clinic_id", clinic.id)
      .order("role", { ascending: true }),
    db.from("patients").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db.from("appointments").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db.from("generated_content").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
    db.from("rank_scans").select("id", { count: "exact", head: true }).eq("clinic_id", clinic.id),
  ]);

  const users = (userRows as ClinicUser[] | null) ?? [];

  return (
    <div>
      <Link
        href="/admin/clinics"
        className="text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        ← Clinics
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
            {clinic.business_name ?? "Unnamed clinic"}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            <span className="capitalize">{clinic.vertical ?? "—"}</span>
            {clinic.city || clinic.area
              ? ` · ${[clinic.area, clinic.city].filter(Boolean).join(", ")}`
              : ""}{" "}
            · Joined {formatDate(clinic.created_at)}
          </p>
        </div>
        <span className="rounded-pill bg-[#4F46E5]/10 px-2.5 py-1 text-xs font-medium capitalize text-[#4F46E5]">
          {(clinic.subscription_status ?? "—").replace("_", " ")}
        </span>
      </div>

      {/* Key stats */}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Users" value={String(users.length)} />
        <Stat label="Patients" value={String(patients.count ?? 0)} />
        <Stat label="Appointments" value={String(appts.count ?? 0)} />
        <Stat label="Content" value={String(content.count ?? 0)} />
        <Stat label="Scans" value={String(scans.count ?? 0)} />
        <Stat
          label="Credits (content/map)"
          value={`${clinic.content_credits_balance ?? 0}/${clinic.map_credits_balance ?? 0}`}
        />
      </div>

      {/* Users */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Users
      </h2>
      <div className="overflow-hidden rounded-card border border-border bg-white">
        {users.length === 0 ? (
          <p className="p-6 text-center text-sm text-text-secondary">
            No users in this clinic.
          </p>
        ) : (
          users.map((u, i) => (
            <div
              key={u.id}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="text-[15px] text-text-primary">
                {u.full_name || "—"}
              </span>
              <span className="flex items-center gap-2">
                {u.is_super_admin ? (
                  <span className="rounded-pill bg-[#4F46E5]/10 px-2 py-0.5 text-xs font-medium text-[#4F46E5]">
                    super admin
                  </span>
                ) : null}
                <span className="text-sm capitalize text-text-secondary">
                  {u.role.replace("_", " ")}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {/* Feature flags */}
      <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
        Feature flags
      </h2>
      <FeatureFlagsEditor clinicId={clinic.id} flags={clinic.feature_flags} />
    </div>
  );
}
