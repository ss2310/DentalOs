"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidEmail } from "@/lib/validation";
import { isAdminRole, type UserRole } from "@/lib/roles";

export type StaffState = { ok?: boolean; error?: string };

// Roles an owner can assign from the UI. Owner isn't assignable — there's
// exactly one, created at signup.
const ASSIGNABLE_ROLES: UserRole[] = ["receptionist", "doctor"];

/**
 * The signed-in admin's id + clinic, or an error state. Every staff mutation
 * goes through this so a receptionist (or a crafted request) can't manage users.
 */
async function adminContext(): Promise<
  { userId: string; clinicId: string } | { error: string }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, home_clinic_id")
    .eq("id", user.id)
    .single();
  if (!isAdminRole(profile?.role as UserRole | undefined)) {
    return { error: "Only an owner or doctor can manage staff." };
  }
  if (!profile?.home_clinic_id) {
    return { error: "No clinic found for your account." };
  }
  return { userId: user.id, clinicId: profile.home_clinic_id };
}

export type AddStaffInput = {
  full_name: string;
  email: string;
  password: string;
  role: string;
};

/**
 * Creates a teammate account in the caller's clinic. Uses the service-role admin
 * client (like signup) so it can create the auth user; the handle_new_user
 * trigger then makes the profile row from this metadata (role + same clinic).
 */
export async function addStaff(input: AddStaffInput): Promise<StaffState> {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx;

  const full_name = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const role: UserRole = ASSIGNABLE_ROLES.includes(input.role as UserRole)
    ? (input.role as UserRole)
    : "receptionist";

  if (!full_name) return { error: "Name is required." };
  if (!isValidEmail(email)) return { error: "Enter a valid email address." };
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const admin = createAdminClient();
  // SECURITY: role + clinic linkage go in app_metadata, which only the
  // service-role admin API can set. handle_new_user() (migration 014) reads
  // authz from there, never from user_metadata — so these can't be forged.
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name,
    },
    app_metadata: {
      role,
      home_clinic_id: ctx.clinicId,
    },
  });
  if (error) {
    const exists = /registered|already/i.test(error.message);
    return {
      error: exists
        ? "An account with this email already exists."
        : "Could not create the account. Please try again.",
    };
  }

  revalidatePath("/settings");
  return { ok: true };
}

/** Permanently removes a teammate (deletes the auth user; profile cascades). */
export async function removeStaff(userId: string): Promise<StaffState> {
  const ctx = await adminContext();
  if ("error" in ctx) return ctx;
  if (!userId) return { error: "Missing user." };
  if (userId === ctx.userId) return { error: "You can't remove your own account." };

  // Verify the target is in the caller's clinic before deleting (guards against a
  // crafted id). profiles RLS lets an admin read same-clinic rows only.
  const supabase = createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("home_clinic_id, role")
    .eq("id", userId)
    .single();
  if (!target || target.home_clinic_id !== ctx.clinicId) {
    return { error: "That teammate isn't in your clinic." };
  }
  if (target.role === "clinic_owner") {
    return { error: "The clinic owner account can't be removed." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: "Could not remove the account. Please try again." };

  revalidatePath("/settings");
  return { ok: true };
}
