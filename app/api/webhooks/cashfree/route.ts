import { NextResponse } from "next/server";
import { Cashfree, CFEnvironment } from "cashfree-pg";
import { createAdminClient } from "@/lib/supabase/admin";

// Cashfree payment webhook. PUBLIC (no session) — see lib/supabase/middleware.ts.
// Fulfillment is the ONLY money-into-access path for the gateway, so correctness
// rules: verify the signature over the RAW body FIRST, parse only after, and let
// the idempotent SECURITY DEFINER RPCs do the actual work.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Minimal shape we read from the verified payload (SDK types this as `any`).
type CashfreeWebhookPayload = {
  type?: string;
  data?: {
    order?: { order_id?: string };
    payment?: { cf_payment_id?: string | number; payment_status?: string };
    customer_details?: { customer_id?: string };
  };
};

function cashfreeClient(): Cashfree {
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  if (!appId || !secret) throw new Error("Cashfree keys are not configured");
  const env =
    process.env.CASHFREE_ENV === "production"
      ? CFEnvironment.PRODUCTION
      : CFEnvironment.SANDBOX;
  return new Cashfree(env, appId, secret);
}

async function heartbeat(status: "ok" | "error", detail: string): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.rpc("record_heartbeat", {
      p_job: "cashfree_webhook",
      p_status: status,
      p_detail: detail.slice(0, 300),
    });
  } catch (e) {
    console.error("cashfree_webhook heartbeat failed:", e);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  // 1. RAW body first — signatures are computed over the exact bytes.
  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature");
  const timestamp = req.headers.get("x-webhook-timestamp");
  if (!signature || !timestamp) {
    return NextResponse.json({ error: "Missing signature headers" }, { status: 400 });
  }

  // 2. Verify BEFORE parsing. Invalid signature → 401, stop.
  let payload: CashfreeWebhookPayload;
  try {
    const event = cashfreeClient().PGVerifyWebhookSignature(signature, raw, timestamp);
    payload = event.object as CashfreeWebhookPayload;
  } catch (e) {
    console.error("Cashfree webhook signature verification failed:", e);
    await heartbeat("error", "signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 3. Only now read fields.
  const status = payload?.data?.payment?.payment_status;
  const orderId = payload?.data?.order?.order_id;
  const rawCfId = payload?.data?.payment?.cf_payment_id;
  const cfPaymentId = rawCfId != null ? String(rawCfId) : "";
  const customerId = payload?.data?.customer_details?.customer_id ?? null;

  if (!orderId) {
    // Verified but unusable (e.g. a bare test ping). Ack so Cashfree stops.
    await heartbeat("ok", "verified event with no order_id");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  const admin = createAdminClient();
  try {
    if (status === "SUCCESS") {
      const { data, error } = await admin.rpc("confirm_cashfree_payment", {
        p_order_id: orderId,
        p_cf_payment_id: cfPaymentId,
        p_customer_id: customerId,
        p_raw: payload,
      });
      if (error) throw error;
      await heartbeat("ok", `${String(data ?? "ok")} ${cfPaymentId}`.trim());
    } else if (status === "FAILED" || status === "USER_DROPPED") {
      const { error } = await admin.rpc("fail_cashfree_payment", {
        p_order_id: orderId,
        p_reason: status,
        p_raw: payload,
      });
      if (error) throw error;
      await heartbeat("ok", `failed ${orderId}`);
    } else {
      // Non-terminal / unhandled status (e.g. PENDING) — ack and ignore.
      await heartbeat("ok", `ignored ${status ?? "unknown"}`);
    }
  } catch (e) {
    // Unexpected fulfillment error. Return 500 so Cashfree RETRIES — the RPCs are
    // idempotent, so a retry re-applies safely rather than losing the payment.
    console.error("Cashfree webhook fulfillment error:", e);
    await heartbeat("error", e instanceof Error ? e.message : "fulfillment error");
    return NextResponse.json({ error: "Processing error" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
