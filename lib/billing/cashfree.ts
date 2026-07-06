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

/**
 * Create a Cashfree hosted Payment Link for an admin-sent purchase. link_id is
 * our pending_payments.id; the paid webhook carries cf_link_id in order_tags,
 * which we store on the row so confirm_cashfree_payment maps it back. Returns the
 * shareable URL + cf_link_id. Server-only; never trusts a client amount.
 */
export async function createCashfreePaymentLink(input: {
  linkId: string;
  amount: number;
  purpose: string;
  customerPhone: string | null;
  customerEmail?: string | null;
}): Promise<{ cfLinkId: string; linkUrl: string }> {
  const cf = cashfreeClient();
  // Links are paid by the clinic owner (possibly logged out), so no return_url —
  // fulfillment is webhook-driven. Valid for 7 days.
  const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  try {
    const res = await cf.PGCreateLink({
      link_id: input.linkId,
      link_amount: Number(input.amount),
      link_currency: "INR",
      link_purpose: input.purpose,
      customer_details: {
        customer_phone: normalizePhone(input.customerPhone),
        ...(input.customerEmail ? { customer_email: input.customerEmail } : {}),
      },
      link_notes: { pending_payment_id: input.linkId },
      link_expiry_time: expiry,
      // We deliver the link over WhatsApp ourselves — don't double-notify.
      link_notify: { send_sms: false, send_email: false },
    });
    const cfLinkId = res.data.cf_link_id;
    const linkUrl = res.data.link_url;
    if (!cfLinkId || !linkUrl) {
      throw new Error("Cashfree did not return a link.");
    }
    return { cfLinkId: String(cfLinkId), linkUrl: String(linkUrl) };
  } catch (e) {
    const detail = cashfreeError(e);
    console.error("Cashfree PGCreateLink failed:", detail, e);
    throw new Error(
      process.env.NODE_ENV === "production"
        ? "Could not create the payment link. Please try again."
        : `Could not create the payment link: ${detail}`,
    );
  }
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
