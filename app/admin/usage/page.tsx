import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminPlaceholder } from "../placeholder";

export const dynamic = "force-dynamic";

export default async function AdminUsagePage() {
  await requireSuperAdmin();
  return (
    <AdminPlaceholder
      title="Usage & Costs"
      note="Credit consumption, API/provider spend, and per-clinic cost breakdowns land in a later step. The credit_ledger + billing_events tables are already in place to feed this."
    />
  );
}
