"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { CONTENT_MODELS } from "@/lib/models";

export type SaveState = { ok?: boolean; error?: string };

/**
 * Persists a generated result as a draft. Credits are charged per generation
 * in the /api/generate route (Generate and Regenerate each cost a real API
 * call), so saving does NOT deduct again — `credits_deducted` on the row just
 * records what that piece cost.
 */
export async function saveContent(input: {
  postTypeId: string;
  topic: string;
  toneUsed: string;
  content: string;
  schema: string | null;
  citable?: boolean;
  modelUsed?: string | null;
}): Promise<SaveState> {
  const content = input.content.trim();
  if (!input.postTypeId || !content) {
    return { error: "Nothing to save." };
  }

  // SEC-M5: content generation is owner/doctor only. The page hides it from
  // receptionists; guard the action too so a crafted request can't slip past.
  if (!isAdminRole(await getUserRole())) {
    return { error: "This action requires an owner or doctor account." };
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const [{ data: profile }, { data: post }] = await Promise.all([
    supabase.from("profiles").select("home_clinic_id").eq("id", user.id).single(),
    supabase
      .from("post_types")
      .select("credits_cost")
      .eq("id", input.postTypeId)
      .single(),
  ]);

  if (!profile?.home_clinic_id) return { error: "No clinic found for user." };
  if (!post) return { error: "That content type could not be found." };

  const cost = post.credits_cost ?? 0;

  const base = {
    clinic_id: profile.home_clinic_id,
    post_type_id: input.postTypeId,
    topic: input.topic.trim() || null,
    tone_used: input.toneUsed || null,
    generated_copy: content,
    schema_markup: input.schema,
    status: "draft" as const,
    credits_deducted: cost,
  };

  // Only persist a model id we recognise — never a client-invented string.
  const modelUsed = CONTENT_MODELS.some((m) => m.id === input.modelUsed)
    ? input.modelUsed
    : null;

  // citable_mode arrives with migration 009 and model_used with 045; if either
  // isn't applied yet, retry without the newer columns so saving never breaks.
  let { error: insertError } = await supabase
    .from("generated_content")
    .insert({ ...base, citable_mode: input.citable ?? false, model_used: modelUsed });
  if (
    insertError &&
    (insertError.code === "PGRST204" ||
      /model_used/i.test(insertError.message ?? ""))
  ) {
    ({ error: insertError } = await supabase
      .from("generated_content")
      .insert({ ...base, citable_mode: input.citable ?? false }));
  }
  if (
    insertError &&
    (insertError.code === "PGRST204" ||
      /citable_mode/i.test(insertError.message ?? ""))
  ) {
    ({ error: insertError } = await supabase
      .from("generated_content")
      .insert(base));
  }
  if (insertError) return { error: "Could not save. Please try again." };

  revalidatePath("/history");
  revalidatePath("/generate");
  return { ok: true };
}
