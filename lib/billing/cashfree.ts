import "server-only";

import { Cashfree, CFEnvironment } from "cashfree-pg";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BillingProvider } from "./provider";

// Cashfree hosted-checkout adapter. startCheckout files a PENDING pending_payments
// row (via the clinic-scoped start_cashfree_checkout RPC — price comes from the
// DB, never the client), creates a Cashfree order whose order_id IS that row's id,
// and returns the payment_session_id for the browser SDK to launch checkout.
//
// Fulfillment (credits/activation) happens ONLY in the webhook, which maps the
// paid order back to confirm_billing_event(). This adapter never grants anything.

type StartRow = {
  pending_payment_id: string;
  amount_inr: number | string;
  clinic_id: string;
  customer_phone: string | null;
};

function cashfreeClient(): Cashfree {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) {
    throw new Error("Payments are not configured. Please try again later.");
  }
  const env =
    process.env.CASHFREE_ENV === "production"
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX;
  return new Cashfree(env, appId, secret);
}

/** Pull the human-readable reason out of a Cashfree/Axios error, if present. */
function cashfreeError(e: unknown): string {
  if (e && typeof e === "object" && "response" in e) {
    const resp = (e as { response?: { data?: { message?: unknown } } }).response;
    const msg = resp?.data?.message;
    if (typeof msg === "string" && msg) return msg;
  }
  return e instanceof Error ? e.message : "unknown error";
}

/** Best last-10-digits phone for Cashfree (requires a 10-digit customer_phone). */
function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  // Drop a leading 91 country code if present, then take the last 10 digits.
  const local = digits.length > 10 ? digits.slice(-10) : digits;
  return local.length === 10 ? local : "9999999999"; // sandbox-safe fallback
}

export const cashfreeProvider: BillingProvider = {
  name: "cashfree",
  async startCheckout({ kind, id }) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // 1. File the pending order (clinic-scoped, DB-authoritative price + guard).
    const { data, error } = await supabase.rpc("start_cashfree_checkout", {
      p_kind: kind,
      p_id: id,
      p_source: "checkout",
    });
    if (error) {
      console.error("start_cashfree_checkout failed:", error);
      // Surface the price-sanity / not-found guards verbatim; they're safe to show.
      throw new Error(error.message || "Could not start checkout. Please try again.");
    }
    const row = data as StartRow;

    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
    if (!appUrl) {
      throw new Error(
        "Payments aren't fully configured (missing app URL). Please try again later.",
      );
    }
    // Build the client up front so a missing-keys error surfaces distinctly
    // rather than being folded into the generic order-failed message below.
    const cf = cashfreeClient();

    // 2. Create the Cashfree order. order_id = pending_payments.id so the webhook
    //    maps the payment back to it. Amount is the DB snapshot, not the client.
    try {
      const res = await cf.PGCreateOrder({
        order_id: row.pending_payment_id,
        order_amount: Number(row.amount_inr),
        order_currency: "INR",
        customer_details: {
          customer_id: row.clinic_id,
          customer_phone: normalizePhone(row.customer_phone),
          ...(user?.email ? { customer_email: user.email } : {}),
        },
        order_meta: {
          return_url: `${appUrl}/upgrade/result?order_id={order_id}`,
        },
      });

      const sessionId = res.data.payment_session_id;
      const cfOrderId = res.data.cf_order_id;
      if (!sessionId) {
        throw new Error("Cashfree did not return a payment session.");
      }
      const mode =
        process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";

      // 3. Record Cashfree's order id on the pending row (service role — RLS
      //    forbids client writes). Best-effort: the webhook maps by our order_id
      //    (= pending_payments.id) regardless, so a failed write-back is not fatal.
      if (cfOrderId) {
        const admin = createAdminClient();
        const { error: upErr } = await admin
          .from("pending_payments")
          .update({ cf_order_id: String(cfOrderId) })
          .eq("id", row.pending_payment_id);
        if (upErr) console.error("cf_order_id write-back failed:", upErr);
      }

      return { sessionId, mode };
    } catch (e) {
      // Order creation failed — mark the pending row so it doesn't linger as
      // 'created', then surface a friendly error.
      try {
        const admin = createAdminClient();
        await admin
          .from("pending_payments")
          .update({ status: "failed" })
          .eq("id", row.pending_payment_id);
      } catch {
        /* best-effort */
      }
      const detail = cashfreeError(e);
      console.error("Cashfree PGCreateOrder failed:", detail, e);
      // In production keep the message generic; in dev surface the real reason so
      // misconfig (bad keys, invalid return_url, etc.) is obvious in the toast.
      throw new Error(
        process.env.NODE_ENV === "production"
          ? "Could not start the payment. Please try again."
          : `Could not start the payment: ${detail}`,
      );
    }
  },
};
