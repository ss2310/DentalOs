import { requireAdminContext } from "@/lib/admin/auth";
import { formatDate } from "@/lib/format";
import { runHealthChecks, type HealthCheck } from "@/lib/system/health";
import { FeatureDefaults, type FlagDefault } from "./feature-defaults";
import { AuditViewer, type AuditRow } from "./audit-viewer";

export const dynamic = "force-dynamic";

const AUDIT_LIMIT = 300;

const LEVEL_DOT: Record<HealthCheck["level"], string> = {
  ok: "bg-success",
  warn: "bg-warning",
  fail: "bg-danger",
};

function HealthCard({ c }: { c: HealthCheck }) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${LEVEL_DOT[c.level]}`} />
        <p className="text-sm font-medium text-text-primary">{c.label}</p>
      </div>
      <p className="mt-1.5 text-sm text-text-secondary">{c.detail}</p>
    </div>
  );
}

function truncate(s: string, n = 100): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function detailSummary(details: unknown): string {
  if (!details || typeof details !== "object") return "";
  try {
    return JSON.stringify(details);
  } catch {
    return "";
  }
}

export default async function AdminSystemPage() {
  const { db } = await requireAdminContext();

  const [health, migrationsRes, defaultsRes, adminAuditRes, billingRes] =
    await Promise.all([
      runHealthChecks(db),
      db
        .from("applied_migrations")
        .select("version, name, applied_at")
        .order("version", { ascending: false }),
      db.from("feature_flag_defaults").select("flag_key, enabled"),
      db
        .from("admin_audit")
        .select("id, admin_user_id, action, target_type, target_id, details, created_at")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LIMIT),
      db
        .from("billing_events")
        .select("id, actor, event_type, clinic_id, amount_inr, note, created_at")
        .order("created_at", { ascending: false })
        .limit(AUDIT_LIMIT),
    ]);

  const migrations =
    (migrationsRes.data as { version: string; name: string | null; applied_at: string }[] | null) ??
    [];
  const defaults = (defaultsRes.data as FlagDefault[] | null) ?? [];

  const adminRows =
    (adminAuditRes.data as {
      id: string;
      admin_user_id: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      details: unknown;
      created_at: string;
    }[] | null) ?? [];
  const billingRows =
    (billingRes.data as {
      id: string;
      actor: string | null;
      event_type: string;
      clinic_id: string | null;
      amount_inr: number | string | null;
      note: string | null;
      created_at: string;
    }[] | null) ?? [];

  // Resolve actor ids → names and clinic ids → names in one query each.
  const actorIds = new Set<string>();
  const clinicIds = new Set<string>();
  for (const r of adminRows) {
    if (r.admin_user_id) actorIds.add(r.admin_user_id);
    if (r.target_type === "clinic" && r.target_id) clinicIds.add(r.target_id);
  }
  for (const r of billingRows) {
    if (r.actor) actorIds.add(r.actor);
    if (r.clinic_id) clinicIds.add(r.clinic_id);
  }

  const [profilesRes, clinicsRes] = await Promise.all([
    actorIds.size
      ? db.from("profiles").select("id, full_name").in("id", Array.from(actorIds))
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    clinicIds.size
      ? db.from("clinics").select("id, business_name").in("id", Array.from(clinicIds))
      : Promise.resolve({ data: [] as { id: string; business_name: string | null }[] }),
  ]);

  const actorName = new Map<string, string>();
  for (const p of (profilesRes.data as { id: string; full_name: string | null }[] | null) ?? []) {
    actorName.set(p.id, (p.full_name ?? "").trim() || p.id.slice(0, 8));
  }
  const clinicName = new Map<string, string>();
  for (const c of (clinicsRes.data as { id: string; business_name: string | null }[] | null) ?? []) {
    clinicName.set(c.id, c.business_name ?? c.id.slice(0, 8));
  }

  const nameFor = (id: string | null) =>
    id ? actorName.get(id) ?? id.slice(0, 8) : "system";

  const auditRows: AuditRow[] = [
    ...adminRows.map((r): AuditRow => {
      const target = r.target_type
        ? `[${r.target_type}${r.target_id ? `:${r.target_id.slice(0, 8)}` : ""}] `
        : "";
      return {
        id: r.id,
        source: "admin",
        when: r.created_at,
        actorId: r.admin_user_id,
        actorName: nameFor(r.admin_user_id),
        action: r.action,
        clinic:
          r.target_type === "clinic" && r.target_id
            ? clinicName.get(r.target_id) ?? "—"
            : "—",
        note: truncate(target + detailSummary(r.details)),
      };
    }),
    ...billingRows.map((r): AuditRow => ({
      id: r.id,
      source: "billing",
      when: r.created_at,
      actorId: r.actor,
      actorName: nameFor(r.actor),
      action: r.event_type,
      clinic: r.clinic_id ? clinicName.get(r.clinic_id) ?? "—" : "—",
      note: truncate(
        [r.note ?? "", r.amount_inr != null ? `₹${r.amount_inr}` : ""]
          .filter(Boolean)
          .join(" · "),
      ),
    })),
  ].sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          System
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-text-secondary">
          Live health, applied migrations, global feature-flag defaults, and the
          who-did-what audit log. Read-only except the feature-flag defaults.
        </p>
      </div>

      {/* 1. HEALTH */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Health
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {health.map((c) => (
            <HealthCard key={c.key} c={c} />
          ))}
        </div>
      </section>

      {/* 2. MIGRATION STATUS */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Applied migrations
        </h2>
        <div className="max-h-96 overflow-auto rounded-card border border-border bg-white shadow-card">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-border text-xs uppercase tracking-wide text-text-secondary">
                <th className="px-4 py-3 font-semibold">Version</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Applied</th>
              </tr>
            </thead>
            <tbody>
              {migrations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-text-secondary">
                    No migrations recorded. Apply migration 031.
                  </td>
                </tr>
              ) : (
                migrations.map((m) => (
                  <tr key={m.version} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium tabular-nums text-text-primary">
                      {m.version}
                    </td>
                    <td className="px-4 py-2 text-text-secondary">{m.name}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-text-secondary">
                      {formatDate(m.applied_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-text-secondary">
          Our own registry (Supabase&apos;s history isn&apos;t reachable). Each new
          migration appends its row; 001–031 were backfilled together.
        </p>
      </section>

      {/* 3. FEATURE-FLAG DEFAULTS */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Feature-flag defaults
        </h2>
        <FeatureDefaults defaults={defaults} />
      </section>

      {/* 4. ADMIN AUDIT VIEWER */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Audit log
        </h2>
        <AuditViewer rows={auditRows} />
      </section>
    </div>
  );
}
