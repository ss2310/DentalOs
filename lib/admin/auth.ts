import "server-only";

import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Access control for the internal /admin panel. The panel is cross-tenant and
// must be unreachable by any clinic user. Identity = profiles.is_super_admin,
// checked server-side via the is_super_admin() RPC (SECURITY DEFINER). This is
// used by BOTH the middleware guard AND every admin page/action independently —
// never trust the route guard alone.

/** The current user's id if they're a super admin, else null. */
async function currentSuperAdminId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) {
    console.error("is_super_admin rpc failed:", error);
    return null; // fail closed
  }
  return data === true ? user.id : null;
}

export async function isSuperAdmin(): Promise<boolean> {
  return (await currentSuperAdminId()) !== null;
}

/**
 * Guard for admin pages/layouts. Calls notFound() — a 404, NOT a 403 — so the
 * panel's existence is never advertised to a clinic user. Returns the admin id.
 */
export async function requireSuperAdmin(): Promise<string> {
  const id = await currentSuperAdminId();
  if (!id) notFound();
  return id;
}

/**
 * Verified admin context for server actions / cross-tenant reads. Independently
 * re-verifies super-admin (defense in depth), THEN hands out the service-role
 * client. The service key never leaves the server. Use the returned `db` for the
 * cross-tenant queries the panel needs; use `adminId` for audit rows.
 */
export async function requireAdminContext(): Promise<{
  adminId: string;
  db: SupabaseClient;
}> {
  const adminId = await requireSuperAdmin();
  return { adminId, db: createAdminClient() };
}

/**
 * Append one entry to admin_audit. Written with the service-role client (the
 * table has no client insert policy). Never throws into the caller — a failed
 * audit is logged, not surfaced, so it can't mask the action's own result.
 */
export async function writeAudit(
  db: SupabaseClient,
  adminId: string,
  action: string,
  target?: { type: string; id: string },
  details?: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from("admin_audit").insert({
    admin_user_id: adminId,
    action,
    target_type: target?.type ?? null,
    target_id: target?.id ?? null,
    details: details ?? null,
  });
  if (error) console.error("admin_audit insert failed:", error);
}
