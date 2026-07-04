import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTE_CLIENT_COLS } from "@/lib/voice-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/voice-notes/[id] — poll a single note's current state. RLS scopes the
 * read to the caller's clinic, so this doubles as the ownership check (a note in
 * another clinic simply returns 404).
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data: note } = await supabase
    .from("clinic_notes")
    .select(NOTE_CLIENT_COLS)
    .eq("id", params.id)
    .maybeSingle();

  if (!note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  return NextResponse.json({ note });
}
