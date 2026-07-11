import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isAdminRole, type UserRole } from "@/lib/roles";
import {
  formatINR,
  formatDate,
  formatTime,
  formatRelativeTime,
  nowIST,
  addDays,
} from "@/lib/format";
import { POSITIVE_OUTCOMES } from "@/lib/recovery-badges";
import { isProfileComplete } from "@/lib/clinic-profile";
import { APPT_STATUS } from "@/app/(app)/appointments/status";
import type {
  AppointmentStatus,
  PatientOption,
  RateCardOption,
} from "@/lib/types";
import { DashboardBookButton } from "./book-button";
import { StatCard, StatGrid } from "@/components/page";

export const dynamic = "force-dynamic";

// Human labels for interaction types shown in the Recent Activity feed.
const INTERACTION_LABEL: Record<string, string> = {
  reminder_24h: "24h Reminder",
  reminder_1h: "1h Reminder",
  recovery_noshow: "No-Show Recovery",
  recovery_cancelled: "Cancellation Recovery",
  review_request: "Review Request",
  payment_reminder: "Payment Reminder",
  case_follow_up: "Case Follow-Up",
  recall_reminder: "Recall Reminder",
  birthday: "Birthday Wish",
  broadcast: "Broadcast",
};

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstOfNextMonth(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1)); // m is 1-based → month index m = next month
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

type ActionRow = {
  emoji: string;
  count: number;
  text: string;
  href: string;
  color: string;
};

function ActionsNeeded({ rows }: { rows: ActionRow[] }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-white">
      {rows.map((row, i) => (
        <Link
          key={i}
          href={row.href}
          className={`flex min-h-[44px] items-center gap-3 px-4 py-3.5 hover:bg-subtle ${
            i > 0 ? "border-t border-border" : ""
          }`}
        >
          <span className="text-lg leading-none">{row.emoji}</span>
          {row.count > 0 ? (
            <>
              <span className="text-[15px] text-text-primary">{row.text}</span>
              <span
                aria-hidden
                className="ml-auto text-text-secondary"
                style={{ color: row.color }}
              >
                →
              </span>
            </>
          ) : (
            <span className="text-[15px] font-medium text-success">
              ✓ All done
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

type ScheduleRow = {
  id: string;
  appointment_time: string;
  status: AppointmentStatus;
  patient_id: string | null;
  patient: { full_name: string } | null;
  treatment: { treatment_name: string } | null;
};

// Statuses where the visit hasn't been logged yet → one-tap "Log Visit".
const LOGGABLE_STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "confirmed",
  "arrived",
  "in_chair",
]);

type ActivityRow = {
  id: string;
  type: string;
  sent_at: string;
  patient: { full_name: string } | null;
};

type FollowupRow = {
  id: string;
  description: string;
  due_date: string | null;
  patient_id: string | null;
  patient: { full_name: string } | null;
};

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { date: today, time } = nowIST();
  const hour = Number(time.slice(0, 2)) || 0;
  const tomorrow = addDays(today, 1);
  const review_lo = addDays(today, -7);
  const review_hi = addDays(today, -2);
  const weekOut = addDays(today, 7);
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonthStart = firstOfNextMonth(today);

  const [
    profileRes,
    clinicRes,
    apptTodayRes,
    pipelineRes,
    outstandingRes,
    recoveredRes,
    remind24Res,
    reviewRes,
    recoveryRes,
    recallRes,
    thinkingRes,
    scheduleRes,
    activityRes,
    patientRes,
    rateCardRes,
    satisfactionRes,
    followupRes,
    kitRes,
    voiceRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("clinics")
      .select(
        "business_name, doctor_name, phone, city, area, address, google_review_url",
      )
      .single(),
    // 1. Appointments today (excluding completed / cancelled)
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_date", today)
      .not("status", "in", "(completed,cancelled_patient)"),
    // 2. Pipeline value (open stages)
    supabase
      .from("case_pipeline")
      .select("plan_value")
      .not("stage", "in", "(rejected,completed)"),
    // 3. Outstanding (open balances)
    supabase.from("outstandings").select("nett_due, patient_id").gt("nett_due", 0),
    // 4. Recovered this month (positive outcomes)
    supabase
      .from("recovery_events")
      .select("revenue_recovered")
      .in("outcome", POSITIVE_OUTCOMES)
      .gte("outcome_date", monthStart)
      .lt("outcome_date", nextMonthStart),
    // Actions row 1: 24h reminders
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("appointment_date", tomorrow)
      .in("status", ["scheduled", "confirmed"])
      .is("reminder_24h_sent_at", null),
    // Actions row 2: review requests pending
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("status", "completed")
      .eq("review_requested", false)
      .gte("appointment_date", review_lo)
      .lte("appointment_date", review_hi),
    // Actions row 3: no-shows / cancellations needing recovery
    supabase
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .in("status", ["no_show", "cancelled_patient"])
      .is("recovery_sent_at", null),
    // Actions row 5: recalls due this week
    supabase
      .from("recalls")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .lte("due_date", weekOut),
    // Actions row 6: case follow-ups due
    supabase
      .from("case_pipeline")
      .select("plan_value")
      .eq("stage", "thinking")
      .lte("follow_up_date", today),
    // Today's schedule — the lead section of the task-first dashboard, so it
    // shows the whole day (not a 5-row teaser) with patient links.
    supabase
      .from("appointments")
      .select(
        "id, appointment_time, status, patient_id, patient:patient_id(full_name), treatment:treatment_type_id(treatment_name)",
      )
      .eq("appointment_date", today)
      .not("status", "in", "(cancelled_patient,rescheduled)")
      .order("appointment_time", { ascending: true })
      .limit(20),
    // Recent activity: last 5 interactions
    supabase
      .from("interactions")
      .select("id, type, sent_at, patient:patient_id(full_name)")
      .order("sent_at", { ascending: false })
      .limit(5),
    // For the Book Appointment quick action
    supabase
      .from("patients")
      .select("id, full_name, whatsapp_number, phone")
      .order("full_name", { ascending: true }),
    supabase
      .from("rate_cards")
      .select("id, treatment_name")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
    // Patient satisfaction: answered surveys over the last ~60 days. This month's
    // rows drive the average + count; any unhandled 1–3 across the window is the
    // red flag that a complaint still needs a call.
    supabase
      .from("survey_responses")
      .select("score, responded_at, notification:notification_id(status)")
      .not("responded_at", "is", null)
      .gte("responded_at", `${addDays(today, -60)}T00:00:00`),
    // Open follow-up tasks that are due (materialized from confirmed voice
    // notes). Surfaced in the morning briefing so this is the ONE place staff
    // act on them — there's no separate follow-ups page to duplicate.
    supabase
      .from("followup_tasks")
      .select(
        "id, description, due_date, patient_id, patient:patient_id(full_name)",
      )
      .eq("status", "open")
      .or(`due_date.lte.${today},due_date.is.null`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50),
    // Setup checklist: logo + Brand Personality existence (new clinics).
    supabase.from("clinic_brand_kits").select("logo_path").maybeSingle(),
    supabase.from("clinic_voice_profiles").select("clinic_id").maybeSingle(),
  ]);

  // Prefer the logged-in user's own name; fall back to the clinic's doctor
  // name (reliably set at signup). Drop a leading "Dr." so we greet by name.
  const nameSource =
    (profileRes.data?.full_name ?? "").trim() ||
    (clinicRes.data?.doctor_name ?? "").trim();
  const firstName =
    nameSource.replace(/^dr\.?\s+/i, "").split(" ")[0] || "there";
  const clinicName = clinicRes.data?.business_name ?? "";
  const doctorName = clinicRes.data?.doctor_name ?? "";
  // Owner/doctor see the money headlines; receptionists get the operational two.
  const showBusiness = isAdminRole(
    (profileRes.data?.role as UserRole | undefined) ?? null,
  );
  const patients = (patientRes.data as PatientOption[]) ?? [];
  const rateCards = (rateCardRes.data as RateCardOption[]) ?? [];

  const apptToday = apptTodayRes.count ?? 0;
  const pipelineValue = ((pipelineRes.data as { plan_value: string }[]) ?? []).reduce(
    (s, r) => s + Number(r.plan_value),
    0,
  );
  const outstandingRows =
    (outstandingRes.data as { nett_due: string; patient_id: string }[]) ?? [];
  const outstandingTotal = outstandingRows.reduce((s, r) => s + Number(r.nett_due), 0);
  const outstandingPatients = new Set(outstandingRows.map((r) => r.patient_id)).size;
  const recoveredMonth = (
    (recoveredRes.data as { revenue_recovered: string }[]) ?? []
  ).reduce((s, r) => s + Number(r.revenue_recovered), 0);

  const remind24 = remind24Res.count ?? 0;
  const reviewPending = reviewRes.count ?? 0;
  const recoveryNeeded = recoveryRes.count ?? 0;
  const recallsDue = recallRes.count ?? 0;
  const thinkingRows = (thinkingRes.data as { plan_value: string }[]) ?? [];
  const followUps = thinkingRows.length;
  const followUpValue = thinkingRows.reduce((s, r) => s + Number(r.plan_value), 0);

  // Patient satisfaction (last ~60 days of answered surveys).
  const surveyRows =
    (satisfactionRes.data as unknown as {
      score: number | null;
      responded_at: string | null;
      notification: { status: string } | null;
    }[]) ?? [];
  const monthScores = surveyRows
    .filter((r) => (r.responded_at ?? "").slice(0, 7) === today.slice(0, 7))
    .map((r) => r.score)
    .filter((n): n is number => n != null);
  const avgSatisfaction =
    monthScores.length > 0
      ? (monthScores.reduce((a, b) => a + b, 0) / monthScores.length).toFixed(1)
      : null;
  const unhandledLow = surveyRows.filter(
    (r) =>
      r.score != null &&
      r.score <= 3 &&
      r.notification?.status !== "acted_on",
  ).length;

  const actions: ActionRow[] = [
    {
      emoji: "📩",
      count: remind24,
      text: `${remind24} patients need 24h reminders`,
      href: "/appointments",
      color: "#D97706",
    },
    {
      emoji: "⭐",
      count: reviewPending,
      text: `${reviewPending} review requests pending`,
      href: "/reviews",
      color: "#0D9488",
    },
    {
      emoji: "🔄",
      count: recoveryNeeded,
      text: `${recoveryNeeded} no-shows/cancellations need recovery`,
      href: "/appointments",
      color: "#D97706",
    },
    {
      emoji: "💰",
      count: outstandingPatients,
      text: `${formatINR(outstandingTotal)} outstanding from ${outstandingPatients} patient${
        outstandingPatients === 1 ? "" : "s"
      }`,
      href: "/billing",
      color: "#DC2626",
    },
    {
      emoji: "📅",
      count: recallsDue,
      text: `${recallsDue} check-ups due this week`,
      href: "/recalls",
      color: "#0D9488",
    },
    {
      emoji: "💼",
      count: followUps,
      text: `${followUps} case follow-ups due (${formatINR(followUpValue)})`,
      href: "/pipeline",
      color: "#D97706",
    },
  ];

  // ---- Setup checklist (owner/doctor, new clinics) -------------------------
  // Ticks come from real data; the card disappears once everything is done.
  const setupItems: { label: string; done: boolean; href: string }[] = [
    {
      label: "Complete your clinic info",
      done: isProfileComplete(
        clinicRes.data as Parameters<typeof isProfileComplete>[0],
      ),
      href: "/settings",
    },
    {
      label: "Upload your logo (stamped on every post image)",
      done: !!kitRes.data?.logo_path,
      href: "/settings",
    },
    {
      label: "Set your Brand Personality",
      done: !!voiceRes.data,
      href: "/social/brand",
    },
    {
      label: "Add your treatments & prices (Rate Card)",
      done: rateCards.length > 0,
      href: "/settings",
    },
    {
      label: "Add your Google review link",
      done: !!clinicRes.data?.google_review_url,
      href: "/settings",
    },
    {
      label: "Add your first patient",
      done: patients.length > 0,
      href: "/patients",
    },
  ];
  const setupDone = setupItems.filter((i) => i.done).length;
  const showSetup = showBusiness && setupDone < setupItems.length;

  const followupTasks = (followupRes.data as unknown as FollowupRow[]) ?? [];
  const followupsDue = followupTasks.length;
  if (followupsDue > 0) {
    actions.push({
      emoji: "📝",
      count: followupsDue,
      text: `${followupsDue} follow-up${followupsDue === 1 ? "" : "s"} due`,
      href: "/dashboard#followups",
      color: "#0D9488",
    });
  }

  const schedule = (scheduleRes.data as unknown as ScheduleRow[]) ?? [];
  const activity = (activityRes.data as unknown as ActivityRow[]) ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight text-text-primary">
            {greetingFor(hour)}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            {clinicName ? `${clinicName} · ` : ""}
            {formatDate(today)}
          </p>
        </div>
        <DashboardBookButton
          patients={patients}
          rateCards={rateCards}
          defaultDate={today}
          defaultDoctor={doctorName}
        />
      </div>

      {/* Setup checklist — walks a new clinic to a fully-working account. */}
      {showSetup ? (
        <div className="mt-5 rounded-card border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[15px] font-semibold text-text-primary">
              Set up your clinic
            </p>
            <span className="rounded-pill bg-white px-2.5 py-1 text-xs font-medium text-text-secondary">
              {setupDone}/{setupItems.length} done
            </span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {setupItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex min-h-[44px] items-center gap-2.5 rounded-button px-3 py-2 text-[15px] ${
                  item.done
                    ? "text-text-secondary"
                    : "bg-white text-text-primary hover:bg-subtle"
                }`}
              >
                <span
                  aria-hidden
                  className={item.done ? "text-success" : "text-text-secondary"}
                >
                  {item.done ? "✓" : "○"}
                </span>
                <span className={item.done ? "line-through opacity-70" : ""}>
                  {item.label}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {/* TASK-FIRST: the day's work leads, numbers follow. A receptionist
          opens the app and it tells her what to do next. */}

      {/* 1. Today's schedule — every row has its one next action. */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Today&apos;s Schedule
          </h2>
          <Link
            href="/appointments"
            className="text-sm font-medium text-primary hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="mt-3 rounded-card border border-border bg-white">
          {schedule.length === 0 ? (
            <p className="p-6 text-center text-sm text-text-secondary">
              No appointments today. Tap Book Appointment to add one — the
              24-hour WhatsApp reminder is prepared for you automatically.
            </p>
          ) : (
            schedule.map((a, i) => {
              const badge = APPT_STATUS[a.status];
              return (
                <div
                  key={a.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="w-16 shrink-0 text-sm font-medium text-text-primary">
                    {formatTime(a.appointment_time)}
                  </span>
                  <div className="min-w-0 flex-1">
                    {a.patient_id ? (
                      <Link
                        href={`/patients/${a.patient_id}`}
                        className="block truncate text-[15px] font-medium text-text-primary hover:text-primary"
                      >
                        {a.patient?.full_name ?? "Unknown"}
                      </Link>
                    ) : (
                      <p className="truncate text-[15px] text-text-primary">
                        {a.patient?.full_name ?? "Unknown"}
                      </p>
                    )}
                    <p className="truncate text-sm text-text-secondary">
                      {a.treatment?.treatment_name ?? "No treatment yet"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-pill px-2.5 py-1 text-xs font-medium ${badge.badge}`}
                  >
                    {badge.label}
                  </span>
                  {LOGGABLE_STATUSES.has(a.status) ? (
                    <Link
                      href={`/visit-log/${a.id}`}
                      className="flex h-11 shrink-0 items-center rounded-button bg-primary px-3 text-sm font-medium text-white hover:bg-primary/90"
                    >
                      Log Visit
                    </Link>
                  ) : a.status === "completed" ? (
                    <span className="shrink-0 text-sm font-medium text-success">
                      ✓
                    </span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Actions needed */}
      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-text-secondary">
        Actions Needed
      </h2>
      <div className="mt-3">
        <ActionsNeeded rows={actions} />
      </div>

      {/* Follow-ups due — materialized from confirmed voice notes. Only shown
          when there's something to act on, so non-voice clinics see nothing. */}
      {followupsDue > 0 ? (
        <div id="followups" className="mt-8 scroll-mt-20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
              Follow-ups Due
            </h2>
            <Link
              href="/notes"
              className="text-sm font-medium text-primary hover:underline"
            >
              All notes →
            </Link>
          </div>
          <div className="mt-3 rounded-card border border-border bg-white">
            {followupTasks.slice(0, 6).map((f, i) => {
              const overdue = Boolean(f.due_date && f.due_date < today);
              return (
                <Link
                  key={f.id}
                  href={f.patient_id ? `/patients/${f.patient_id}` : "/notes"}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-subtle ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-text-primary">
                      {f.description}
                    </p>
                    <p className="truncate text-sm text-text-secondary">
                      {f.patient?.full_name ?? "General note"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm ${
                      overdue ? "font-medium text-danger" : "text-text-secondary"
                    }`}
                  >
                    {f.due_date ? formatDate(f.due_date) : "No date"}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* 3. The numbers — below the work, where the owner scrolls to. */}
      <StatGrid cols={4}>
        <StatCard label="Appointments Today" value={String(apptToday)} hero />
        {showBusiness ? (
          <StatCard
            label="Plan Value"
            value={formatINR(pipelineValue)}
            tone="success"
          />
        ) : null}
        <StatCard
          label="Outstanding"
          value={formatINR(outstandingTotal)}
          tone={outstandingTotal > 0 ? "danger" : "default"}
        />
        {showBusiness ? (
          <StatCard
            label="Recovered This Month"
            value={formatINR(recoveredMonth)}
            tone="success"
          />
        ) : null}
        <Link
          href="/reviews"
          className={`block rounded-card border bg-white p-5 shadow-card transition-colors hover:bg-subtle ${
            unhandledLow > 0 ? "border-danger/40" : "border-border"
          }`}
        >
          <p className="text-sm font-medium text-text-secondary">
            Patient Satisfaction
          </p>
          <p
            className={`mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.02em] ${
              unhandledLow > 0 ? "text-danger" : "text-text-primary"
            }`}
          >
            {avgSatisfaction ? `${avgSatisfaction} ★` : "—"}
          </p>
          <p
            className={`mt-2 text-sm ${
              unhandledLow > 0 ? "font-medium text-danger" : "text-text-secondary"
            }`}
          >
            {unhandledLow > 0
              ? `${unhandledLow} unhappy — call now`
              : `${monthScores.length} response${
                  monthScores.length === 1 ? "" : "s"
                } this month`}
          </p>
        </Link>
      </StatGrid>

      {/* Deep Audit entry — owner/doctor only */}
      {showBusiness ? (
        <Link
          href="/audit"
          className="mt-6 flex items-center justify-between gap-3 rounded-card border border-border bg-white p-5 shadow-card transition-colors hover:bg-subtle"
        >
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-text-primary">
              Deep Audit — beat your local competitors
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              See what your top rivals do better and get a 30-day catch-up plan.
            </p>
          </div>
          <span aria-hidden className="shrink-0 text-primary">
            →
          </span>
        </Link>
      ) : null}

      <div className="mt-8">
        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Recent Activity
          </h2>
          <div className="mt-3 rounded-card border border-border bg-white">
            {activity.length === 0 ? (
              <p className="p-6 text-center text-sm text-text-secondary">
                No activity yet.
              </p>
            ) : (
              activity.map((a, i) => (
                <div
                  key={a.id}
                  className={`flex items-center gap-2 px-4 py-3 text-sm ${
                    i > 0 ? "border-t border-border" : ""
                  }`}
                >
                  <span className="shrink-0 text-text-secondary">
                    {formatRelativeTime(a.sent_at)}
                  </span>
                  <span className="text-text-secondary">·</span>
                  <span className="shrink-0 font-medium text-text-primary">
                    {INTERACTION_LABEL[a.type] ?? a.type}
                  </span>
                  <span className="text-text-secondary">·</span>
                  <span className="truncate text-text-secondary">
                    {a.patient?.full_name ?? "Unknown"}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
