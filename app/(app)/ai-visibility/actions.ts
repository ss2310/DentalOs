"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildQueryTemplates, ENGINE_KEYS } from "@/lib/ai-visibility";
import { isAdminRole, type UserRole } from "@/lib/roles";

export type AiActionState = { ok?: boolean; error?: string; count?: number };

type ClinicCtx = { clinicId: string; userId: string };

// AI Visibility lives under Marketing (owner/doctor only). RLS scopes every write
// to the caller's clinic; this adds the role gate so access matches the nav.
async function clinicCtx(): Promise<ClinicCtx | { error: string }> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("home_clinic_id, role")
    .eq("id", user.id)
    .single();
  if (!profile?.home_clinic_id) return { error: "No clinic found for your account." };
  if (!isAdminRole(profile.role as UserRole | undefined)) {
    return { error: "AI Visibility is available to owner or doctor accounts." };
  }
  return { clinicId: profile.home_clinic_id as string, userId: user.id };
}

/** First-run: seed the query set from templates filled with the clinic's data. */
export async function generateQuerySet(): Promise<AiActionState> {
  const ctx = await clinicCtx();
  if ("error" in ctx) return ctx;
  const supabase = createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("business_name, area, city, vertical")
    .single();

  // Skip templates the clinic already has (so re-running never duplicates).
  const { data: existing } = await supabase
    .from("ai_visibility_queries")
    .select("query_text");
  const have = new Set(
    (existing ?? []).map((r) => r.query_text.trim().toLowerCase()),
  );

  const rows = buildQueryTemplates(
    {
      name: clinic?.business_name,
      area: clinic?.area,
      city: clinic?.city,
    },
    (clinic as { vertical?: string | null } | null)?.vertical,
  )
    .filter((t) => !have.has(t.query_text.toLowerCase()))
    .map((t) => ({
      clinic_id: ctx.clinicId,
      query_text: t.query_text,
      query_layer: t.query_layer,
      is_active: true,
    }));

  if (rows.length === 0) return { ok: true, count: 0 };

  const { error } = await supabase.from("ai_visibility_queries").insert(rows);
  if (error) return { error: "Could not generate the query set. Please try again." };

  revalidatePath("/ai-visibility");
  return { ok: true, count: rows.length };
}

export async function addQuery(input: {
  query_text: string;
  query_layer?: string;
}): Promise<AiActionState> {
  const ctx = await clinicCtx();
  if ("error" in ctx) return ctx;

  const text = input.query_text.trim();
  if (!text) return { error: "Enter a query." };

  const supabase = createClient();
  const { error } = await supabase.from("ai_visibility_queries").insert({
    clinic_id: ctx.clinicId,
    query_text: text,
    query_layer: input.query_layer || null,
    is_active: true,
  });
  if (error) return { error: "Could not add the query. Please try again." };

  revalidatePath("/ai-visibility");
  return { ok: true };
}

export async function updateQuery(
  id: string,
  query_text: string,
): Promise<AiActionState> {
  const ctx = await clinicCtx();
  if ("error" in ctx) return ctx;

  const text = query_text.trim();
  if (!text) return { error: "Query can't be empty." };

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_visibility_queries")
    .update({ query_text: text })
    .eq("id", id);
  if (error) return { error: "Could not save. Please try again." };

  revalidatePath("/ai-visibility");
  return { ok: true };
}

export async function setQueryActive(
  id: string,
  is_active: boolean,
): Promise<AiActionState> {
  const ctx = await clinicCtx();
  if ("error" in ctx) return ctx;

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_visibility_queries")
    .update({ is_active })
    .eq("id", id);
  if (error) return { error: "Could not update. Please try again." };

  revalidatePath("/ai-visibility");
  return { ok: true };
}

export async function deleteQuery(id: string): Promise<AiActionState> {
  const ctx = await clinicCtx();
  if ("error" in ctx) return ctx;

  const supabase = createClient();
  const { error } = await supabase
    .from("ai_visibility_queries")
    .delete()
    .eq("id", id);
  if (error) return { error: "Could not delete. Please try again." };

  revalidatePath("/ai-visibility");
  return { ok: true };
}

export type RecordCheckInput = {
  query_id: string;
  engine: string;
  is_cited: boolean;
  is_mentioned: boolean;
  cited_sources?: string[];
  raw_excerpt?: string;
  position_note?: string;
};

/** Saves one manual check (append-only history). Called once per query × engine. */
export async function recordCheck(
  input: RecordCheckInput,
): Promise<AiActionState> {
  const ctx = await clinicCtx();
  if ("error" in ctx) return ctx;
  if (!input.query_id || !(ENGINE_KEYS as string[]).includes(input.engine)) {
    return { error: "Invalid check." };
  }

  const supabase = createClient();
  const sources = (input.cited_sources ?? [])
    .map((s) => s.trim())
    .filter(Boolean);

  const { error } = await supabase.from("ai_visibility_checks").insert({
    clinic_id: ctx.clinicId,
    query_id: input.query_id,
    engine: input.engine,
    is_cited: input.is_cited,
    // A check is "mentioned only" when named but not cited — never both.
    is_mentioned: input.is_mentioned && !input.is_cited,
    cited_sources: sources.length ? sources : null,
    raw_excerpt: input.raw_excerpt?.trim() || null,
    position_note: input.position_note?.trim() || null,
    checked_by: ctx.userId,
    check_method: "manual",
  });
  if (error) return { error: "Could not save the check. Please try again." };

  revalidatePath("/ai-visibility");
  return { ok: true };
}
