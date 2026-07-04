import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice-notes/export — DPDP data-portability export. Streams this
 * clinic's complete voice-note record (notes + follow-ups + agent audit) as a
 * JSON download. Owner/doctor only. Every query is RLS-scoped, so the file can
 * only ever contain the caller's own clinic data.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!isAdminRole(await getUserRole())) {
    return NextResponse.json(
      { error: "Only an owner or doctor can export clinic data." },
      { status: 403 },
    );
  }

  const [notes, followups, audit] = await Promise.all([
    supabase
      .from("clinic_notes")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("followup_tasks")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase
      .from("agent_audit")
      .select("*")
      .order("created_at", { ascending: true }),
  ]);

  const payload = {
    exported_at: new Date().toISOString(),
    clinic_notes: notes.data ?? [],
    followup_tasks: followups.data ?? [],
    agent_audit: audit.data ?? [],
  };

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="voice-notes-export-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
