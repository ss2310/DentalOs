import "server-only";

import type { BillingProvider } from "./provider";

// TODO(cashfree): implement the Cashfree adapter — mirror razorpay.ts. Create a
// Cashfree order, return its { redirectUrl }; a webhook confirms payment via
// confirm_billing_event() (service role). Register in getBillingProvider() once
// built; the /upgrade page needs no changes.
export const cashfreeProvider: BillingProvider = {
  name: "cashfree",
  async startCheckout() {
    throw new Error("Cashfree checkout is not implemented yet.");
  },
};
