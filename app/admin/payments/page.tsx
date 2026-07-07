import { requireAdminContext } from "@/lib/admin/auth";
import { PaymentsTable, type FeedRow } from "./payments-table";

export const dynamic = "force-dynamic";

// The money feed: every gateway payment + payment link across all clinics.
export default async function AdminPaymentsPage() {
  const { db } = await requireAdminContext();
  const { data } = await db.rpc("admin_payments_feed");
  const rows = (data as FeedRow[] | null) ?? [];

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
        Payments
      </h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        Every Cashfree checkout and payment link across all clinics.
      </p>

      <div className="mt-6">
        <PaymentsTable rows={rows} />
      </div>
    </div>
  );
}
