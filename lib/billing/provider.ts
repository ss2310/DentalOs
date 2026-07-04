import "server-only";

import { manualProvider } from "./manual";

// Provider-agnostic checkout seam. One implementation is live today ('manual');
// razorpay/cashfree adapters slot in behind this same interface later WITHOUT
// touching the /upgrade page — it only ever talks to getBillingProvider().

export type CheckoutKind = "plan" | "pack";

// Manual returns a pending message (an admin confirms out-of-band). Real
// providers will return a hosted-checkout redirect URL instead.
export type CheckoutResult =
  | { pending: true; message: string }
  | { redirectUrl: string };

export interface BillingProvider {
  readonly name: string;
  startCheckout(input: { kind: CheckoutKind; id: string }): Promise<CheckoutResult>;
}

/**
 * Resolve a clinic's billing provider by name (from clinics.billing_provider).
 * Falls back to 'manual' — the only implementation wired today — so an unknown
 * or not-yet-built provider degrades to hand-onboarding rather than crashing.
 */
export function getBillingProvider(name: string | null | undefined): BillingProvider {
  switch (name) {
    case "manual":
      return manualProvider;
    // TODO(razorpay): return razorpayProvider; (see ./razorpay.ts)
    // TODO(cashfree): return cashfreeProvider; (see ./cashfree.ts)
    default:
      return manualProvider;
  }
}
