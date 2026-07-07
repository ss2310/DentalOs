import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enqueueAutoRun } from "@/lib/audit/drive";
import {
  isDueForReaudit,
  inMidPlanWindow,
  isStalled,
  pickEasiestPending,
  midPlanNudgeMessage,
  reauditNudgeMessage,
} from "@/lib/audit/recurring.mjs";

// DAILY orchestrator for the recurring Deep Audit. Guarded by CRON_SECRET
// (Vercel Cron / pg_cron+pg_net). LIGHT work only — it enqueues auto re-audits
// and sends nudges; the companion runner (/api/cron/deep-audit-runner) drives the
// heavy pipeline one stage per tick. Service-role admin client (no session).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const out = { enqueued: 0, reauditNudged: 0, midPlanNudged: 0, teased: 0 };

  // ---- 1. AUTO RE-AUDIT + top-up nudge + trial teaser ----------------------
  const { data: clinics } = await admin
    .from("clinics")
    .select("id, subscription_status, deep_audit_credits, reaudit_nudge_sent_at")
    .in("subscription_status", ["active", "trial"]);
  const list = (clinics ?? []) as {
    id: string;
    subscription_status: string;
    deep_audit_credits: number | null;
    reaudit_nudge_sent_at: string | null;
  }[];

  if (list.length > 0) {
    const ids = list.map((c) => c.id);
    const { data: runs } = await admin
      .from("audit_runs")
      .select("clinic_id, status, completed_at")
      .in("clinic_id", ids);
    const state = new Map<string, { latest: string | null; inFlight: boolean }>();
    for (const c of list) state.set(c.id, { latest: null, inFlight: false });
    for (const r of (runs ?? []) as { clinic_id: string; status: string; completed_at: string | null }[]) {
      const e = state.get(r.clinic_id);
      if (!e) continue;
      if (r.status === "complete") {
        if (r.completed_at && (!e.latest || r.completed_at > e.latest)) e.latest = r.completed_at;
      } else if (r.status !== "failed") {
        e.inFlight = true; // queued or mid-pipeline — don't stack another
      }
    }

    for (const c of list) {
      const e = state.get(c.id)!;
      if (e.inFlight) continue;
      if (!isDueForReaudit(e.latest, nowMs)) continue;

      if (c.subscription_status === "trial") {
        // No auto-run for trials. Teaser only AFTER their first audit is stale
        // (a brand-new trial still has its free audit to run manually).
        if (e.latest && !c.reaudit_nudge_sent_at) {
          await notify(admin, c.id, "routine", "Your next growth plan is waiting", "Upgrade to the Growth plan to unlock your next 30-day audit.", "/upgrade");
          await admin.from("clinics").update({ reaudit_nudge_sent_at: nowIso }).eq("id", c.id);
          out.teased++;
        }
        continue;
      }

      // Active subscriber.
      if ((c.deep_audit_credits ?? 0) >= 1) {
        const runId = await enqueueAutoRun(admin, c.id);
        if (runId) {
          // Clear the nudge stamp so a future low-credit window can nudge again.
          if (c.reaudit_nudge_sent_at) {
            await admin.from("clinics").update({ reaudit_nudge_sent_at: null }).eq("id", c.id);
          }
          out.enqueued++;
        }
      } else if (!c.reaudit_nudge_sent_at) {
        const msg = reauditNudgeMessage(`${appUrl()}/upgrade`);
        await notify(admin, c.id, "important", "Your next 30-day plan is ready", msg, "/upgrade");
        await admin.from("clinics").update({ reaudit_nudge_sent_at: nowIso }).eq("id", c.id);
        out.reauditNudged++;
      }
    }
  }

  // ---- 2. MID-PLAN NUDGE (stalled active plans, once, in the 7-10d window) --
  const { data: plans } = await admin
    .from("audit_plans")
    .select("id, run_id, clinic_id, created_at, mid_plan_nudge_sent_at")
    .eq("status", "active")
    .is("mid_plan_nudge_sent_at", null);
  for (const p of (plans ?? []) as {
    id: string;
    run_id: string;
    clinic_id: string;
    created_at: string;
    mid_plan_nudge_sent_at: string | null;
  }[]) {
    if (!inMidPlanWindow(p.created_at, nowMs)) continue;
    const { data: items } = await admin
      .from("plan_items")
      .select("day_number, effort, status, title")
      .eq("plan_id", p.id);
    const arr = (items ?? []) as { day_number: number; effort: string | null; status: string; title: string | null }[];
    const done = arr.filter((i) => i.status === "done").length;
    if (!isStalled(done, arr.length)) continue;

    const pendingCount = arr.filter((i) => i.status === "pending").length;
    const easiest = pickEasiestPending(arr);
    const reportUrl = `${appUrl()}/audit/report/${p.run_id}`;
    const msg = midPlanNudgeMessage({
      pendingCount,
      easiestTitle: easiest?.title ?? null,
      reportUrl,
    });
    const { data: stamped } = await admin
      .from("audit_plans")
      .update({ mid_plan_nudge_sent_at: nowIso, mid_plan_nudge_wa_message: msg })
      .eq("id", p.id)
      .is("mid_plan_nudge_sent_at", null)
      .select("id")
      .maybeSingle();
    if (!stamped) continue;
    await notify(admin, p.clinic_id, "routine", "Your growth plan needs a nudge", msg, `/audit/report/${p.run_id}`);
    out.midPlanNudged++;
  }

  return NextResponse.json({ ok: true, ...out });
}

async function notify(
  admin: ReturnType<typeof createAdminClient>,
  clinicId: string,
  priority: "urgent" | "important" | "routine",
  title: string,
  body: string,
  actionUrl: string,
) {
  await admin.rpc("create_notification", {
    p_clinic_id: clinicId,
    p_type: "system",
    p_priority: priority,
    p_title: title,
    p_body: body,
    p_action_url: actionUrl,
  });
}
