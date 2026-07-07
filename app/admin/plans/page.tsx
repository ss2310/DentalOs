import { requireAdminContext } from "@/lib/admin/auth";
import { PlansTable, type PlanRow } from "./plans-table";
import { PacksTable, type PackRow } from "./packs-table";

export const dynamic = "force-dynamic";

// A2 — plan & pack management. Super-admin only: requireAdminContext re-verifies
// the platform owner and hands out the service-role client for these platform
// catalog reads (plans/credit_packs are RLS super-admin-write; the page reads
// them via the same context the mutations use).
export default async function AdminPlansPage() {
  const { db } = await requireAdminContext();

  const [{ data: plans }, { data: packs }] = await Promise.all([
    db
      .from("plans")
      .select(
        "id, name, price_inr, content_credits, map_credits, billing_period, is_active, sort_order",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    db
      .from("credit_packs")
      .select(
        "id, name, price_inr, content_credits, map_credits, is_active, sort_order",
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ]);

  const planRows = (plans as PlanRow[] | null) ?? [];
  const packRows = (packs as PackRow[] | null) ?? [];
  const hasAnnual = planRows.some((p) => p.billing_period === "annual");

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          Plans &amp; Packs
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] text-text-secondary">
          Set what clinics can buy. These prices and credit grants flow live to
          the clinic-facing Upgrade page and to checkout — nothing is hardcoded.
          Editing here takes effect immediately.
        </p>
      </div>

      <PlansTable rows={planRows} hasAnnual={hasAnnual} />
      <PacksTable rows={packRows} />
    </div>
  );
}
