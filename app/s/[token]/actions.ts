"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitState = {
  ok?: boolean;
  route?: "review_request" | "private_followup";
  alreadyDone?: boolean;
  error?: string;
};

// Public (anon) survey submit. The clinic's data stays fully RLS-locked; this
// touches exactly one row through the token-scoped SECURITY DEFINER RPC, which
// also raises the urgent alert for a low score. No auth required.
export async function submitSurvey(
  token: string,
  score: number,
  comment?: string,
): Promise<SubmitState> {
  if (!token) return { error: "Missing survey link." };
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    return { error: "Please pick a rating from 1 to 5." };
  }

  // Cap the free-text comment so an anon caller can't push an unbounded string.
  const trimmed = (comment ?? "").trim().slice(0, 1000);

  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_survey_response", {
    p_token: token,
    p_score: score,
    p_comment: trimmed || null,
  });

  if (error) {
    // The RPC raises for an invalid or already-used token.
    if (/already-used|invalid/i.test(error.message)) {
      return { alreadyDone: true };
    }
    console.error("submit_survey_response failed:", error);
    return { error: "Could not save your response. Please try again." };
  }

  return { ok: true, route: data as SubmitState["route"] };
}
