import "server-only";

import { manualProvider } from "./manual";
import { cashfreeProvider } from "./cashfree";

// Provider-agnostic checkout seam. Two implementations live today: 'cashfree'
// (the customer-facing default) and 'manual' (admin hand-onboarding). Adapters
// slot in behind this same interface WITHOUT touching the /upgrade page — it only
// ever talks to getBillingProvider().

export type CheckoutKind = "plan" | "pack";

// Manual returns a pending message (an admin confirms out-of-band). Cashfree
// returns a payment_session_id the browser SDK launches checkout with. (A
// redirectUrl variant is kept for any redirect-style provider.)
export type CheckoutResult =
  | { pending: true; message: string }
  | { redirectUrl: string }
  | { sessionId: string; mode: "sandbox" | "production" };

export interface BillingProvider {
  readonly name: string;
  startCheckout(input: { kind: CheckoutKind; id: string }): Promise<CheckoutResult>;
}

/**
 * Resolve a clinic's billing provider by name (from clinics.billing_provider).
 * Defaults to 'cashfree' — the customer-facing path — so an unset/unknown value
 * routes to the live gateway. 'manual' stays an explicit admin-set escape hatch
 * for hand-onboarding.
 */
export function getBillingProvider(name: string | null | undefined): BillingProvider {
  switch (name) {
    case "manual":
      return manualProvider;
    case "cashfree":
      return cashfreeProvider;
    // TODO(razorpay): return razorpayProvider; (see ./razorpay.ts)
    default:
      return cashfreeProvider;
  }
}
