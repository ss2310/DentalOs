"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type PhotoState = { ok?: boolean; error?: string };

const MAX_BYTES = 5 * 1024 * 1024; // matches the bucket cap

/** Magic-byte sniff — never trust the declared MIME (same posture as
 *  lib/visuals sniffImageMime, plus webp which the bucket also allows). */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

export async function uploadPatientPhoto(
  patientId: string,
  formData: FormData,
): Promise<PhotoState> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Pick a photo first." };
  }
  if (file.size > MAX_BYTES) return { error: "Photo must be under 5 MB." };

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  // RLS-scoped read doubles as the ownership check + gives us clinic_id for
  // the bucket path convention (<clinic_id>/<patient_id>.<ext>).
  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, photo_path")
    .eq("id", patientId)
    .maybeSingle();
  if (!patient) return { error: "Patient not found." };

  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return { error: "Use a JPG, PNG, or WebP image." };

  const path = `${patient.clinic_id}/${patientId}.${kind.ext}`;
  const { error: upErr } = await supabase.storage
    .from("patient-photos")
    .upload(path, buf, { contentType: kind.mime, upsert: true });
  if (upErr) return { error: "Could not upload the photo. Please try again." };

  // Extension may change (jpg → png), leaving the old object behind — remove it.
  if (patient.photo_path && patient.photo_path !== path) {
    await supabase.storage.from("patient-photos").remove([patient.photo_path]);
  }

  const { error } = await supabase
    .from("patients")
    .update({ photo_path: path })
    .eq("id", patientId);
  if (error) return { error: "Could not save the photo. Please try again." };

  revalidatePath(`/patients/${patientId}`);
  return { ok: true };
}
