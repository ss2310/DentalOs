"use server";

import { createClient } from "@/lib/supabase/server";

export type PaymentStatus = "created" | "paid" | "failed" | "expired" | "unknown";

/**
 * Read a pending payment's gateway status for the result page. Display-only —
 * fulfillment (credits/activation) happens in the webhook, never here. RLS
 * restricts the row to the caller's own clinic, so a guessed order_id from
 * another clinic returns 'unknown'.
 */
export async function getPaymentStatus(orderId: string): Promise<PaymentStatus> {
  // uuid shape check — avoids a pointless query on a malformed order_id.
  if (
    !orderId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)
  ) {
    return "unknown";
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("pending_payments")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();

  return (data?.status as PaymentStatus) ?? "unknown";
}
