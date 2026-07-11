"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type QuickNoteState = { ok?: boolean; error?: string };

/**
 * Typed quick note from the patient profile — a clinic_notes row born
 * 'confirmed' (no transcript, no audio, no extraction to review). Renders in
 * the same notes list as voice notes. clinic_id / created_by come from the
 * table defaults (current_clinic_id() / auth.uid()), enforced by RLS.
 */
export async function addQuickNote(input: {
  patientId: string;
  text: string;
}): Promise<QuickNoteState> {
  const text = input.text.trim();
  if (!input.patientId) return { error: "Missing patient." };
  if (!text) return { error: "Write the note first." };
  if (text.length > 2000) return { error: "Keep the note under 2,000 characters." };

  const supabase = createClient();
  const { error } = await supabase.from("clinic_notes").insert({
    patient_id: input.patientId,
    note_text: text,
    status: "confirmed",
    tags: [],
  });
  if (error) return { error: "Could not save the note. Please try again." };

  revalidatePath(`/patients/${input.patientId}`);
  return { ok: true };
}
