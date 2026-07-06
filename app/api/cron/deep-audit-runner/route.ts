import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceOneStage, nextAutoRunId } from "@/lib/audit/drive";

// RUNNER for auto re-audits: advances the oldest in-flight 'auto' run by ONE
// stage per invocation (mirrors the browser poller), so each call stays under the
// function limit even though a full audit is 5-8 min. Run it every ~2 min. On
// completion, runNextStage fires the delta digest; on a discover-stage failure,
// advanceOneStage refunds the consumed credit. Guarded by CRON_SECRET.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // one stage (synthesis is the ~2-3 min long pole)

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const runId = await nextAutoRunId(admin);
  if (!runId) return NextResponse.json({ ok: true, idle: true });

  try {
    const res = await advanceOneStage(admin, runId);
    return NextResponse.json({
      ok: true,
      runId,
      stage: res?.stageKey,
      status: res?.status,
      done: res?.done ?? false,
    });
  } catch (err) {
    // advanceOneStage already marked the run failed + refunded any credit; report
    // without 500-ing (so the scheduler doesn't treat a single bad run as an outage).
    return NextResponse.json({
      ok: false,
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
