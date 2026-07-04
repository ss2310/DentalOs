import { requireSuperAdmin } from "@/lib/admin/auth";
import { AdminPlaceholder } from "../placeholder";

export const dynamic = "force-dynamic";

export default async function AdminSystemPage() {
  await requireSuperAdmin();
  return (
    <AdminPlaceholder
      title="System"
      note="Health, migration status, feature-flag defaults, and the admin_audit viewer land in a later step (A3)."
    />
  );
}
