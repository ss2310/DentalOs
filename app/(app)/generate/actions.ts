"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
}): Promise<SaveState> {
  const content = input.content.trim();
  if (!input.postTypeId || !content) {
    return { error: "Nothing to save." };
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

  const { error: insertError } = await supabase.from("generated_content").insert({
    clinic_id: profile.home_clinic_id,
    post_type_id: input.postTypeId,
    topic: input.topic.trim() || null,
    tone_used: input.toneUsed || null,
    generated_copy: content,
    schema_markup: input.schema,
    status: "draft",
    credits_deducted: cost,
  });
  if (insertError) return { error: "Could not save. Please try again." };

  revalidatePath("/history");
  revalidatePath("/generate");
  return { ok: true };
}
