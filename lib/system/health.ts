import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRelativeTime } from "@/lib/format";

// Live server-side health checks for the admin System panel. No external
// monitoring service — each check hits the real dependency and reports a
// green/amber/red status. Every check is self-contained and never throws: one
// failing dependency can't take down the page.

export type HealthLevel = "ok" | "warn" | "fail";

export type HealthCheck = {
  key: string;
  label: string;
  level: HealthLevel;
  detail: string;
  at?: string | null; // ISO timestamp for time-based checks
};

// A daily job that hasn't run in >26h is stale (the schedule is once/day).
const CRON_STALE_MS = 26 * 60 * 60 * 1000;
const CASHFREE_TIMEOUT_MS = 5000;

/** DB + PostgREST reachable? A trivial head-count against an always-present table. */
async function checkDb(db: SupabaseClient): Promise<HealthCheck> {
  try {
    const { error } = await db
      .from("plans")
      .select("id", { count: "exact", head: true });
    if (error) {
      return { key: "db", label: "Database", level: "fail", detail: error.message };
    }
    return { key: "db", label: "Database", level: "ok", detail: "Reachable" };
  } catch (e) {
    return {
      key: "db",
      label: "Database",
      level: "fail",
      detail: e instanceof Error ? e.message : "Unreachable",
    };
  }
}

/** Cashfree API reachable? Any HTTP response = reachable; timeout/DNS = down. */
async function checkCashfree(): Promise<HealthCheck> {
  const label = "Cashfree API";
  const appId = process.env.CASHFREE_APP_ID;
  const secret = process.env.CASHFREE_SECRET_KEY;
  const env = process.env.CASHFREE_ENV === "production" ? "production" : "sandbox";
  if (!appId || !secret) {
    return {
      key: "cashfree",
      label,
      level: "warn",
      detail: "Not configured (no API keys set)",
    };
  }
  const base =
    env === "production"
      ? "https://api.cashfree.com/pg"
      : "https://sandbox.cashfree.com/pg";
  try {
    // Read a deliberately non-existent order — harmless, and proves reachability
    // + whether our credentials authenticate.
    const res = await fetch(`${base}/orders/hc_ping_nonexistent`, {
      method: "GET",
      headers: {
        "x-client-id": appId,
        "x-client-secret": secret,
        "x-api-version": "2023-08-01",
        accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(CASHFREE_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      return {
        key: "cashfree",
        label,
        level: "warn",
        detail: `Reachable (${env}) but credentials rejected (HTTP ${res.status})`,
      };
    }
    if (res.status >= 500) {
      return {
        key: "cashfree",
        label,
        level: "warn",
        detail: `Reachable (${env}) but gateway error (HTTP ${res.status})`,
      };
    }
    return {
      key: "cashfree",
      label,
      level: "ok",
      detail: `Reachable (${env})`,
    };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return {
      key: "cashfree",
      label,
      level: "fail",
      detail: timedOut ? `No response within ${CASHFREE_TIMEOUT_MS / 1000}s` : "Unreachable",
    };
  }
}

/** Read a job's heartbeat row and grade it by recency + status. */
async function checkHeartbeat(
  db: SupabaseClient,
  key: string,
  jobName: string,
  label: string,
  neverDetail: string,
): Promise<HealthCheck> {
  try {
    const { data, error } = await db
      .from("system_heartbeats")
      .select("status, detail, last_run_at")
      .eq("job_name", jobName)
      .maybeSingle();
    if (error) {
      return { key, label, level: "warn", detail: "Heartbeat unavailable" };
    }
    if (!data) {
      return { key, label, level: "warn", detail: neverDetail };
    }
    const at = data.last_run_at as string;
    const ageMs = Date.now() - new Date(at).getTime();
    if (data.status === "error") {
      return {
        key,
        label,
        level: "fail",
        detail: `Last run failed${data.detail ? `: ${data.detail}` : ""}`,
        at,
      };
    }
    if (ageMs > CRON_STALE_MS) {
      return {
        key,
        label,
        level: "warn",
        detail: `Stale — last ran ${formatRelativeTime(at)}`,
        at,
      };
    }
    return { key, label, level: "ok", detail: `Last ran ${formatRelativeTime(at)}`, at };
  } catch {
    return { key, label, level: "warn", detail: "Heartbeat unavailable" };
  }
}

export async function runHealthChecks(db: SupabaseClient): Promise<HealthCheck[]> {
  return Promise.all([
    checkDb(db),
    checkCashfree(),
    checkHeartbeat(
      db,
      "cron",
      "subscription_lifecycle",
      "Daily scheduled job",
      "No run recorded yet",
    ),
    checkHeartbeat(
      db,
      "webhook",
      "cashfree_webhook",
      "Last webhook received",
      "No webhook received yet",
    ),
  ]);
}
