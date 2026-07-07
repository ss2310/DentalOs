import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Mirrors the user_role enum in 001_init.sql.
export type UserRole = "clinic_owner" | "doctor" | "receptionist";

// The "admin tier" — owner and doctor see everything; receptionists get the
// front-desk subset. Mirrors is_clinic_admin() in migration 013.
export const ADMIN_ROLES: UserRole[] = ["clinic_owner", "doctor"];

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === "clinic_owner" || role === "doctor";
}

/** The logged-in user's role, or null if unauthenticated / no profile. */
export async function getUserRole(): Promise<UserRole | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (data?.role as UserRole | undefined) ?? null;
}

/**
 * Page guard for admin-only (owner/doctor) routes. Receptionists are bounced
 * to the dashboard. Call as the first line of a server-component page.
 * Fails closed: an unknown/missing role is treated as non-admin.
 */
export async function requireAdmin(): Promise<UserRole> {
  const role = await getUserRole();
  if (!isAdminRole(role)) redirect("/dashboard");
  return role as UserRole;
}

/**
 * Guard for server actions / route handlers. Throws instead of redirecting so
 * the mutation is denied. UI already hides these features from receptionists;
 * this is the defense-in-depth backstop against a crafted request.
 */
export async function assertAdmin(): Promise<UserRole> {
  const role = await getUserRole();
  if (!isAdminRole(role)) {
    throw new Error("Forbidden: this action requires an owner or doctor account.");
  }
  return role as UserRole;
}
