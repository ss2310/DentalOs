import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nowIST } from "@/lib/format";

// Per-clinic monthly scan allowance. One "scan" = one Run Scan (any grid size)
// and counts as 1 of the monthly quota. Usage is the number of rank_scans rows
// this clinic created in the current calendar month; the caller's RLS-scoped
// client keeps the count limited to their own clinic (no service role needed).
//
// TODO (post-launch): once the payment gateway is live in the deployed stage,
// add purchasable credit top-ups on top of this base monthly allowance. The
// block below is where the "buy more" path will hook in.

const DEFAULT_MONTHLY_SCAN_CAP = 15;

export function monthlyScanCap(): number {
  const raw = Number(process.env.SERP_MONTHLY_SCAN_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : DEFAULT_MONTHLY_SCAN_CAP;
}

export type ScanBudget = { used: number; cap: number; remaining: number };

export async function getScanBudget(
  supabase: SupabaseClient,
): Promise<ScanBudget> {
  const monthStart = `${nowIST().date.slice(0, 7)}-01T00:00:00+05:30`;
  const { count } = await supabase
    .from("rank_scans")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthStart);

  const used = count ?? 0;
  const cap = monthlyScanCap();
  return { used, cap, remaining: Math.max(cap - used, 0) };
}

// ---- Agency prospecting audits ----
// Separate allowance from clinic scans: prospect_audits are agency-scoped, so
// usage is this agency user's own audits this calendar month (RLS restricts the
// count to created_by = auth.uid()). One Run Audit = 1 of the monthly quota.

const DEFAULT_MONTHLY_AUDIT_CAP = 30;

export function monthlyAuditCap(): number {
  const raw = Number(process.env.AGENCY_MONTHLY_AUDIT_CAP);
  return Number.isFinite(raw) && raw > 0
    ? Math.trunc(raw)
    : DEFAULT_MONTHLY_AUDIT_CAP;
}

export async function getAuditBudget(
  supabase: SupabaseClient,
): Promise<ScanBudget> {
  const monthStart = `${nowIST().date.slice(0, 7)}-01T00:00:00+05:30`;
  const { count } = await supabase
    .from("prospect_audits")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monthStart);

  const used = count ?? 0;
  const cap = monthlyAuditCap();
  return { used, cap, remaining: Math.max(cap - used, 0) };
}
