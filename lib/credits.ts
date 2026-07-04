import "server-only";

import { createClient } from "@/lib/supabase/server";

// Shared credit engine (migration 020). All spends go through the atomic
// spend_credits RPC, which derives the clinic from the session (current_clinic_id)
// — we intentionally do NOT accept a client-supplied clinicId, so a caller can
// never spend against another tenant. Mirrors the 015 reserve/refund safety on
// the new balance model (clinics.content_credits_balance / map_credits_balance).

export type CreditKind = "content" | "map";

// Reasons the app writes today. trial_grant/topup/admin_adjust/monthly_reset are
// grant-side (service role); refund is written by refund_credit_ledger.
export type SpendReason = "generation" | "map_scan";

export type SpendResult =
  | { ok: true; ledgerId: string; balanceAfter: number }
  | { ok: false; insufficient: true }
  | { ok: false; error: string };

/**
 * Atomically spend `amount` credits of `kind` for the current user's clinic,
 * writing a credit_ledger row, BEFORE the paid call. On success the caller
 * proceeds and — if the paid call then fails — passes `ledgerId` to
 * `refundCredit` so the clinic isn't charged for nothing. `insufficient` means
 * the balance was too low and nothing was spent (show an upgrade prompt).
 */
export async function spendCredits(
  kind: CreditKind,
  amount: number,
  reason: SpendReason,
  relatedId?: string | null,
): Promise<SpendResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("spend_credits", {
    p_kind: kind,
    p_amount: amount,
    p_reason: reason,
    p_related_id: relatedId ?? null,
  });

  if (error) {
    console.error("spend_credits failed:", error);
    return { ok: false, error: "Could not check your credits. Please try again." };
  }
  if (data === null || data === undefined) {
    return { ok: false, insufficient: true };
  }

  const row = data as { ledger_id: string; balance_after: number };
  return { ok: true, ledgerId: row.ledger_id, balanceAfter: row.balance_after };
}

/**
 * Reverse a prior spend (its `ledgerId`) whose paid call failed. Safe to call
 * best-effort — the RPC no-ops if the row is missing or already refunded, and
 * we never throw into the caller (the paid failure is the real error to report).
 */
export async function refundCredit(ledgerId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("refund_credit_ledger", {
    p_ledger_id: ledgerId,
  });
  if (error) console.error("refund_credit_ledger failed:", error);
}
