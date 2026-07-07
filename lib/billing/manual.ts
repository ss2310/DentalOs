import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { BillingProvider } from "./provider";

// The 'manual' provider charges nothing. It records a PENDING billing_events row
// (via the clinic-scoped start_manual_checkout RPC) that the platform owner
// confirms from /admin/subscriptions. This is what we use while hand-onboarding
// clinics before a real payment gateway is wired.
export const manualProvider: BillingProvider = {
  name: "manual",
  async startCheckout({ kind, id }) {
    const supabase = createClient();
    const { error } = await supabase.rpc("start_manual_checkout", {
      p_kind: kind,
      p_id: id,
    });
    if (error) {
      console.error("start_manual_checkout failed:", error);
      throw new Error("Could not start checkout. Please try again.");
    }
    return {
      pending: true,
      message:
        "Payment pending — your account will be activated once confirmed.",
    };
  },
};
