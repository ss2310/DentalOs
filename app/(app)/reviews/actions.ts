"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { nowIST, addDays } from "@/lib/format";
import { getUserRole, isAdminRole } from "@/lib/roles";

// Mirrors the /api/generate route: Claude is called server-side only, the API
// key never reaches the client, and credits are checked before + deducted after
// a successful generation.
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 1500;
const WINDOW_DAYS = 90;

export type InsightState = {
  content?: string;
  creditsLeft?: number;
  error?: string;
};

// Plain-English brief for a clinic owner. The four section titles are fixed so
// the UI + the owner always get the same shape. "Only patterns present in the
// data" + "say so if thin" are the anti-fabrication guardrails.
const SYSTEM_PROMPT = `You are a friendly practice advisor writing a monthly insight report for the owner of {{clinic_name}}, a dental clinic in {{area}}, {{city}}, India.
You are given REAL aggregate numbers from the clinic's last 90 days. Write a short, plain-English report the owner can read in two minutes.

Output EXACTLY these four sections, each under its own heading, in this order:
What patients love
What's hurting you
One number to watch
Do these 3 things this month

Rules:
- Hinglish-friendly, warm, and practical — like a helpful colleague, not a consultant. No corporate jargon, no buzzwords.
- Base EVERYTHING only on the numbers and comments supplied below. NEVER invent facts, figures, trends, or patient quotes.
- If a section has thin or no data to support it, SAY SO honestly (e.g. "Not enough survey responses yet this quarter to call this out") instead of padding or guessing.
- Keep each of the first three sections to 2–4 short sentences. The last section is exactly 3 concrete, specific actions as a numbered list.
- Refer to real numbers from the data where they help (e.g. "your no-show rate is 18%").
- No medical guarantees, no superlatives, no made-up benchmarks.
- Output only the report — no preamble, no sign-off, no markdown code fences.`;

function fill(t: string, vars: Record<string, string>): string {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

/** Counts occurrences of a string key across a list of rows. */
function tally<T extends string>(values: (T | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    if (!v) continue;
    out[v] = (out[v] ?? 0) + 1;
  }
  return out;
}

/**
 * Gathers the clinic's last 90 days of signals, sends them to Claude, deducts
 * credits, and saves the report as a generated_content row so it appears in
 * /history. All queries are RLS-scoped to the caller's clinic.
 */
export async function generateInsightReport(): Promise<InsightState> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };
  if (!isAdminRole(await getUserRole()))
    return { error: "Only an owner or doctor can generate insight reports." };

  const [{ data: post }, { data: clinic }] = await Promise.all([
    supabase
      .from("post_types")
      .select("id, credits_cost")
      .eq("name", "Insight Report")
      .single(),
    supabase
      .from("clinics")
      .select(
        "id, business_name, city, area, doctor_name, monthly_credits, credits_used",
      )
      .single(),
  ]);

  if (!post) {
    return {
      error:
        "Insight Report isn't set up yet. Run migration 010_insight_report.sql.",
    };
  }
  if (!clinic) return { error: "No clinic found for this account." };

  const cost = post.credits_cost ?? 2;

  const { date: today } = nowIST();
  const windowStart = addDays(today, -WINDOW_DAYS); // 'YYYY-MM-DD'
  const windowStartTs = `${windowStart}T00:00:00`; // for timestamptz columns

  // --- Gather the last 90 days of signals (all RLS-scoped) ---
  const [surveyRes, interactionRes, apptRes, recoveryRes] = await Promise.all([
    supabase
      .from("survey_responses")
      .select("score, comment, responded_at")
      .not("responded_at", "is", null)
      .gte("responded_at", windowStartTs),
    supabase
      .from("interactions")
      .select("type")
      .gte("sent_at", windowStartTs),
    supabase
      .from("appointments")
      .select("status")
      .gte("appointment_date", windowStart)
      .lte("appointment_date", today),
    supabase
      .from("recovery_events")
      .select("outcome, revenue_recovered")
      .gte("trigger_date", windowStart),
  ]);

  const surveys = (surveyRes.data ?? []) as {
    score: number | null;
    comment: string | null;
  }[];
  const interactions = (interactionRes.data ?? []) as { type: string | null }[];
  const appts = (apptRes.data ?? []) as { status: string | null }[];
  const recoveries = (recoveryRes.data ?? []) as {
    outcome: string | null;
    revenue_recovered: number | string | null;
  }[];

  // Survey stats: average score, promoters (4–5) vs detractors (1–2), and up to
  // 15 real comments (trimmed) — never summarised or invented.
  const scores = surveys.map((s) => s.score).filter((n): n is number => n != null);
  const avgScore =
    scores.length > 0
      ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
      : null;
  const promoters = scores.filter((n) => n >= 4).length;
  const detractors = scores.filter((n) => n <= 2).length;
  const comments = surveys
    .map((s) => (s.comment ?? "").trim())
    .filter(Boolean)
    .slice(0, 15)
    .map((c) => (c.length > 240 ? `${c.slice(0, 240)}…` : c));

  // No-show rate over appointments that reached their date (terminal outcomes).
  const statusCounts = tally(appts.map((a) => a.status));
  const noShow = statusCounts["no_show"] ?? 0;
  const completed = statusCounts["completed"] ?? 0;
  const cancelled = statusCounts["cancelled_patient"] ?? 0;
  const reached = noShow + completed + cancelled;
  const noShowRate = reached > 0 ? Math.round((noShow / reached) * 100) : null;

  // Recovery outcomes + rupees actually recovered in the window.
  const outcomeCounts = tally(recoveries.map((r) => r.outcome));
  const revenueRecovered = recoveries.reduce(
    (sum, r) => sum + (Number(r.revenue_recovered) || 0),
    0,
  );

  const dataSummary = {
    window_days: WINDOW_DAYS,
    surveys: {
      responses: surveys.length,
      average_score_out_of_5: avgScore,
      promoters_4_5: promoters,
      detractors_1_2: detractors,
      comments,
    },
    patient_messages_by_type: tally(interactions.map((i) => i.type)),
    appointments: {
      reached_their_date: reached,
      completed,
      no_shows: noShow,
      patient_cancellations: cancelled,
      no_show_rate_percent: noShowRate,
    },
    revenue_recovery: {
      events: recoveries.length,
      outcomes: outcomeCounts,
      rupees_recovered: Math.round(revenueRecovered),
    },
  };

  // Enough signal to write a meaningful report? If everything is empty, tell the
  // owner honestly instead of spending a credit on a hollow generation.
  const hasSignal =
    surveys.length > 0 || interactions.length > 0 || appts.length > 0 || recoveries.length > 0;
  if (!hasSignal) {
    return {
      error:
        "No activity in the last 90 days yet — add some visits, surveys or recovery events first.",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { error: "AI is not configured on the server yet." };
  }

  const vars = {
    clinic_name: clinic.business_name ?? "our clinic",
    city: clinic.city ?? "",
    area: clinic.area ?? "",
    doctor_name: clinic.doctor_name ?? "our dentist",
  };
  const system = fill(SYSTEM_PROMPT, vars);
  const userMessage = `Here is the real aggregate data for the last ${WINDOW_DAYS} days (JSON). Write the report from this only:\n\n${JSON.stringify(
    dataSummary,
    null,
    2,
  )}`;

  // Reserve credits ATOMICALLY before the paid call (SEC-H1/L1). NULL means
  // not enough credits — we stop before spending anything. Refunded below if
  // the generation fails after reserving.
  const reference = crypto.randomUUID();
  const { data: reservedLeft, error: reserveError } = await supabase.rpc(
    "reserve_credits",
    { p_cost: cost, p_reason: "insight_report", p_reference: reference },
  );
  if (reserveError) {
    console.error("Credit reserve failed:", reserveError);
    return { error: "Could not check your credits. Please try again." };
  }
  if (reservedLeft === null) {
    const remaining =
      (clinic.monthly_credits ?? 0) - (clinic.credits_used ?? 0);
    return {
      error: `Not enough credits — this needs ${cost}, you have ${Math.max(remaining, 0)} left this month.`,
    };
  }
  const creditsLeft = reservedLeft as number;
  const refund = () =>
    supabase.rpc("refund_credits", { p_reference: reference });

  let content: string;
  try {
    const anthropic = new Anthropic({ apiKey });
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: "user", content: userMessage }],
    });
    content = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (err) {
    await refund();
    console.error("Insight report generation failed:", err);
    return {
      error:
        "Something went wrong while generating the report. Please try again.",
    };
  }

  if (!content) {
    await refund();
    return { error: "The AI returned an empty report. Please try again." };
  }

  // Save to history. `${today}` gives a stable month label; drop-and-retry isn't
  // needed here because the row uses only base columns.
  const monthLabel = new Date(`${today}T12:00:00`).toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
  });
  const { error: saveError } = await supabase.from("generated_content").insert({
    clinic_id: clinic.id,
    post_type_id: post.id,
    topic: `Monthly Insight — ${monthLabel}`,
    tone_used: null,
    generated_copy: content,
    schema_markup: null,
    status: "draft" as const,
    credits_deducted: cost,
  });
  if (saveError) console.error("Failed to save insight report:", saveError);

  revalidatePath("/history");
  revalidatePath("/reviews");
  return { content, creditsLeft };
}
