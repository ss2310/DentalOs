import { requireAdminContext } from "@/lib/admin/auth";
import { PendingList, type PendingRow } from "./pending-list";

export const dynamic = "force-dynamic";

type RawPending = {
  id: string;
  created_at: string;
  event_type: string;
  amount_inr: number | string | null;
  plan_id: string | null;
  credit_pack_id: string | null;
  clinics: { business_name: string | null } | null;
  plans: { name: string | null } | null;
  credit_packs: { name: string | null } | null;
};

export default async function AdminSubscriptionsPage() {
  // requireAdminContext re-verifies super-admin, THEN gives the service-role
  // client for these cross-tenant reads.
  const { db } = await requireAdminContext();

  const { data } = await db
    .from("billing_events")
    .select(
      "id, created_at, event_type, amount_inr, plan_id, credit_pack_id, clinics(business_name), plans(name), credit_packs(name)",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const rows: PendingRow[] = ((data as RawPending[] | null) ?? []).map((r) => ({
    id: r.id,
    created_at: r.created_at,
    kind: r.plan_id ? "Plan" : "Top-up",
    itemName: r.plan_id
      ? (r.plans?.name ?? "Plan")
      : (r.credit_packs?.name ?? "Top-up"),
    clinicName: r.clinics?.business_name ?? "Unknown clinic",
    amount: r.amount_inr,
  }));

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
          Subscriptions
        </h1>
        <span className="text-sm text-text-secondary">
          {rows.length} pending
        </span>
      </div>
      <p className="mt-2 max-w-2xl text-[15px] text-text-secondary">
        Confirm a manual payment to activate the clinic&apos;s plan or apply a
        credit top-up. Setting plan/pack prices and full per-clinic subscription
        management land in a later step (A2).
      </p>

      <PendingList rows={rows} />
    </div>
  );
}
