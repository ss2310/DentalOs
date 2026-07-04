import "server-only";

import type { BillingProvider } from "./provider";

// TODO(razorpay): implement the Razorpay adapter.
//   startCheckout → create a Razorpay order for the plan/pack price, return its
//   hosted-checkout { redirectUrl }. A webhook handler then calls
//   confirm_billing_event() (service role) on payment.captured to activate the
//   plan / apply the top-up — exactly what the admin Confirm button does today.
// Register it in getBillingProvider() (lib/billing/provider.ts) once built; no
// changes to the /upgrade page are needed.
export const razorpayProvider: BillingProvider = {
  name: "razorpay",
  async startCheckout() {
    throw new Error("Razorpay checkout is not implemented yet.");
  },
};
