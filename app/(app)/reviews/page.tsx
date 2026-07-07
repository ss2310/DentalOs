import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { formatDate, formatTime, nowIST, addDays } from "@/lib/format";
import {
  PageHeader,
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import { ReviewsTabs } from "./reviews-tabs";
import { InsightsClient, type LastReport } from "./insights-client";
import { PostVisitActions } from "./post-visit-actions";
import { SurveyRowActions } from "./survey-row-actions";

export const dynamic = "force-dynamic";

// Completed appointments within this many days back are eligible for a post-visit
// survey / review request (older than that, asking feels stale to the patient).
const WINDOW_DAYS = 30;

type ReviewRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  review_requested: boolean;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  treatment: { treatment_name: string } | null;
};

type SurveyResp = {
  id: string;
  score: number | null;
  comment: string | null;
  responded_at: string | null;
  routed_to: "review_request" | "private_followup" | null;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  notification: { status: string } | null;
};

// 4–5 = happy (teal/success), 3 = neutral (warning), 1–2 = unhappy (danger).
function scoreTone(score: number): string {
  if (score >= 4) return "border-success/30 bg-success/5 text-success";
  if (score === 3) return "border-warning/30 bg-warning/5 text-warning";
  return "border-danger/30 bg-danger/5 text-danger";
}

export default async function ReviewsPage() {
  const supabase = createClient();
  const { date: today } = nowIST();
  const windowStart = addDays(today, -WINDOW_DAYS);
  const thisMonthKey = today.slice(0, 7);

  // All RLS-scoped to the caller's clinic.
  const [
    apptRes,
    clinicRes,
    postRes,
    lastReportRes,
    surveySentRes,
    surveyRespRes,
  ] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, review_requested, patient:patient_id(full_name, whatsapp_number), treatment:treatment_type_id(treatment_name)",
      )
      .eq("status", "completed")
      .gte("appointment_date", windowStart)
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false }),
    supabase
      .from("clinics")
      .select("google_review_url, content_credits_balance")
      .single(),
    // post_types is a global read-only catalog; presence gates the Insights tab.
    supabase.from("post_types").select("id").eq("name", "Insight Report").single(),
    // Most recent saved Insight Report, so the tab shows it on revisit.
    supabase
      .from("generated_content")
      .select("generated_copy, created_at, post:post_type_id(name)")
      .order("created_at", { ascending: false })
      .limit(20),
    // Which completed appointments already have a survey sent (anti-duplicate),
    // and how many were sent this month.
    supabase.from("survey_responses").select("appointment_id, sent_at"),
    // Answered surveys for the Survey Responses tab, newest first.
    supabase
      .from("survey_responses")
      .select(
        "id, score, comment, responded_at, routed_to, patient:patient_id(full_name, whatsapp_number), notification:notification_id(status)",
      )
      .not("responded_at", "is", null)
      .order("responded_at", { ascending: false })
      .limit(100),
  ]);

  const appts = (apptRes.data as unknown as ReviewRow[]) ?? [];
  const reviewUrl = clinicRes.data?.google_review_url ?? "";
  const remainingCredits = clinicRes.data?.content_credits_balance ?? 0;
  const insightReady = !!postRes.data;
  const canSeeInsights = isAdminRole(await getUserRole());

  const lastReportRow = (
    (lastReportRes.data ?? []) as unknown as {
      generated_copy: string;
      created_at: string;
      post: { name: string } | null;
    }[]
  ).find((r) => r.post?.name === "Insight Report");
  const lastReport: LastReport = lastReportRow
    ? { content: lastReportRow.generated_copy, created_at: lastReportRow.created_at }
    : null;

  const surveySentRows =
    (surveySentRes.data as { appointment_id: string | null; sent_at: string }[]) ??
    [];
  const surveySentSet = new Set(
    surveySentRows.map((r) => r.appointment_id).filter(Boolean),
  );
  const surveysThisMonth = surveySentRows.filter(
    (r) => (r.sent_at ?? "").slice(0, 7) === thisMonthKey,
  ).length;
  const awaitingSurvey = appts.filter((a) => !surveySentSet.has(a.id)).length;

  const responses = (surveyRespRes.data as unknown as SurveyResp[]) ?? [];
  const scored = responses
    .map((r) => r.score)
    .filter((n): n is number => n != null);
  const avgScore =
    scored.length > 0
      ? (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1)
      : null;

  const requests = (
    <>
      <StatGrid cols={2}>
        <StatCard label="Awaiting Survey" value={String(awaitingSurvey)} />
        <StatCard
          label="Surveys Sent This Month"
          value={String(surveysThisMonth)}
          tone="success"
        />
      </StatGrid>

      {/* Missing review URL warning — the review CTA needs it */}
      {!reviewUrl ? (
        <div className="mt-4 rounded-card border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm text-text-primary">
            No Google review link is set yet, so happy patients won&apos;t get
            one. Add it in{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              Settings
            </Link>{" "}
            → Google review URL.
          </p>
        </div>
      ) : null}

      <SectionHeader hint="Most recent visit first">
        Completed Visits
      </SectionHeader>
      <div>
        {appts.length === 0 ? (
          <EmptyState>
            No completed visits in the last {WINDOW_DAYS} days yet.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {appts.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-card border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-text-primary">
                    {a.patient?.full_name ?? "Unknown"}
                  </p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {formatDate(a.appointment_date)} ·{" "}
                    {formatTime(a.appointment_time)}
                    {a.treatment?.treatment_name
                      ? ` · ${a.treatment.treatment_name}`
                      : ""}
                  </p>
                </div>
                {a.patient?.whatsapp_number ? (
                  <PostVisitActions
                    appointmentId={a.id}
                    patientName={a.patient.full_name ?? "there"}
                    patientNumber={a.patient.whatsapp_number}
                    reviewUrl={reviewUrl}
                    surveySent={surveySentSet.has(a.id)}
                    reviewSent={a.review_requested}
                  />
                ) : (
                  <span className="text-sm text-text-secondary">
                    No WhatsApp number
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );

  const surveys = (
    <>
      <StatGrid cols={2}>
        <StatCard
          label="Average Rating"
          value={avgScore ? `${avgScore} ★` : "—"}
          tone="primary"
        />
        <StatCard label="Responses" value={String(responses.length)} />
      </StatGrid>

      <SectionHeader hint="Most recent first">Responses</SectionHeader>
      <div>
        {responses.length === 0 ? (
          <EmptyState>
            No survey responses yet. Send a survey from a completed visit to get
            started.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {responses.map((r) => {
              const score = r.score ?? 0;
              const low = score <= 3;
              const handled = r.notification?.status === "acted_on";
              return (
                <div
                  key={r.id}
                  className="flex flex-col gap-3 rounded-card border border-border bg-white p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-text-primary">
                        {r.patient?.full_name ?? "Unknown"}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-medium ${scoreTone(score)}`}
                      >
                        {score}/5 ★
                      </span>
                    </div>
                    {r.comment ? (
                      <p className="mt-1.5 text-sm text-text-primary">
                        &ldquo;{r.comment}&rdquo;
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-text-secondary">
                      {r.responded_at ? formatDate(r.responded_at.slice(0, 10)) : ""}
                    </p>
                  </div>
                  {low ? (
                    <div className="shrink-0">
                      <SurveyRowActions
                        surveyId={r.id}
                        patientName={r.patient?.full_name ?? "there"}
                        patientNumber={r.patient?.whatsapp_number ?? ""}
                        handled={handled}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="Send a post-visit survey, route happy patients to Google, and catch unhappy ones privately."
      />

      <ReviewsTabs
        showInsights={canSeeInsights}
        requests={requests}
        surveys={surveys}
        insights={
          <InsightsClient
            remaining={remainingCredits}
            ready={insightReady}
            lastReport={lastReport}
          />
        }
      />
    </div>
  );
}
