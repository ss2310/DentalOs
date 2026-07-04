// Minimal type shim for the Cashfree browser checkout SDK, which ships no .d.ts.
// Covers only what we use: load() + checkout({ paymentSessionId, redirectTarget }).
declare module "@cashfreepayments/cashfree-js" {
  export type CashfreeMode = "sandbox" | "production";

  export interface CheckoutOptions {
    paymentSessionId: string;
    redirectTarget?: "_self" | "_blank" | "_top" | "_modal";
    returnUrl?: string;
  }

  export interface CheckoutResult {
    error?: { message?: string };
    redirect?: boolean;
    paymentDetails?: unknown;
  }

  export interface CashfreeInstance {
    checkout(options: CheckoutOptions): Promise<CheckoutResult>;
  }

  export function load(options: { mode: CashfreeMode }): Promise<CashfreeInstance>;
}
