import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VOICE_BUCKET } from "@/lib/voice-notes";
import { RETENTION_DAYS, selectAudioPurge } from "@/lib/voice-notes-purge";

// Cross-tenant maintenance job → service-role client (bypasses RLS). Guarded by
// a shared CRON_SECRET so only the scheduler can invoke it. Node runtime for the
// storage API. The retention RULE lives in lib/voice-notes-purge (pure + unit
// tested); this route just applies it against a batch.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Purge voice-note audio. Removes the stored clip and nulls `audio_path` for any
 * note that is either already `confirmed` (transcript is the record) or older
 * than the 7-day hard cap regardless of status. The transcript row is kept.
 *
 * Schedule this daily — e.g. a Vercel Cron entry in vercel.json hitting
 * `/api/cron/purge-voice-audio`, or pg_cron + pg_net posting to it. The confirm
 * action already purges inline, so this mainly enforces the hard cap and sweeps
 * abandoned (never-confirmed / failed) notes.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createAdminClient();
  const nowMs = Date.now();
  const cutoff = new Date(nowMs - RETENTION_DAYS * 86_400_000).toISOString();

  // SQL prefilter for efficiency: still holds audio AND (confirmed OR past the
  // hard cap). We refetch status/created_at so the tested predicate can have the
  // final say — the SQL and the JS rule can never drift apart.
  const { data: rows, error } = await admin
    .from("clinic_notes")
    .select("id, audio_path, status, created_at")
    .not("audio_path", "is", null)
    .or(`status.eq.confirmed,created_at.lt.${cutoff}`)
    .limit(1000);

  if (error) {
    console.error("purge-voice-audio query failed:", error);
    return NextResponse.json({ error: "Query failed." }, { status: 500 });
  }

  const { ids, paths } = selectAudioPurge(rows ?? [], {
    nowMs,
    retentionDays: RETENTION_DAYS,
  });
  if (ids.length === 0) {
    return NextResponse.json({ purged: 0 });
  }

  if (paths.length > 0) {
    const { error: rmError } = await admin.storage
      .from(VOICE_BUCKET)
      .remove(paths);
    if (rmError) {
      // Log but continue — we still clear the DB references so we don't loop on
      // objects that are already gone.
      console.error("purge-voice-audio remove failed:", rmError);
    }
  }

  const { error: updError } = await admin
    .from("clinic_notes")
    .update({ audio_path: null })
    .in("id", ids);
  if (updError) {
    console.error("purge-voice-audio update failed:", updError);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ purged: paths.length });
}
