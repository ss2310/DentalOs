"use server";

import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { getBillingProvider, type CheckoutKind } from "@/lib/billing/provider";

export type CheckoutState = {
  message?: string;
  redirectUrl?: string;
  sessionId?: string;
  mode?: "sandbox" | "production";
  error?: string;
};

/**
 * Start a checkout for a plan or credit pack. Resolves the clinic's billing
 * provider (manual today) and delegates — the manual provider files a pending
 * order for an admin to confirm; future providers return a hosted-checkout URL.
 * Owner/doctor only (billing is an admin-role action).
 */
export async function startCheckout(
  kind: CheckoutKind,
  id: string,
): Promise<CheckoutState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isAdminRole(await getUserRole())) {
    return { error: "Only an owner or doctor can manage billing." };
  }
  if (kind !== "plan" && kind !== "pack") return { error: "Invalid selection." };
  if (!id) return { error: "Pick a plan or pack first." };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("billing_provider")
    .single();

  const provider = getBillingProvider(clinic?.billing_provider);
  try {
    const result = await provider.startCheckout({ kind, id });
    if ("pending" in result) return { message: result.message };
    if ("sessionId" in result)
      return { sessionId: result.sessionId, mode: result.mode };
    return { redirectUrl: result.redirectUrl };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not start checkout.",
    };
  }
}
