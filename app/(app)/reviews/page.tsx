import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime, nowIST, addDays } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import {
  PageHeader,
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import { WhatsAppActions } from "../appointments/whatsapp-actions";
import type { WaAction } from "../appointments/wa-actions";

export const dynamic = "force-dynamic";

// Completed appointments reviewed within this many days back are eligible for a
// review request (older than that, asking feels stale to the patient).
const WINDOW_DAYS = 30;

type ReviewRow = {
  id: string;
  appointment_date: string;
  appointment_time: string;
  review_requested: boolean;
  review_requested_at: string | null;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  treatment: { treatment_name: string } | null;
};

function reviewMessage(name: string, url: string): string {
  return `Hi ${name} ji, aapka visit accha raha 😊\nAgar experience accha laga, toh 30 seconds mein review dein:\n🔗 ${url}\nShukriya! 🙏`;
}

export default async function ReviewsPage() {
  const supabase = createClient();
  const { date: today } = nowIST();
  const windowStart = addDays(today, -WINDOW_DAYS);
  const thisMonthKey = today.slice(0, 7);

  // All RLS-scoped to the caller's clinic.
  const [apptRes, clinicRes] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, appointment_date, appointment_time, review_requested, review_requested_at, patient:patient_id(full_name, whatsapp_number), treatment:treatment_type_id(treatment_name)",
      )
      .eq("status", "completed")
      .gte("appointment_date", windowStart)
      .order("appointment_date", { ascending: false })
      .order("appointment_time", { ascending: false }),
    supabase.from("clinics").select("google_review_url").single(),
  ]);

  const appts = (apptRes.data as unknown as ReviewRow[]) ?? [];
  const reviewUrl = clinicRes.data?.google_review_url ?? "";

  const pending = appts.filter((a) => !a.review_requested);
  const sent = appts.filter((a) => a.review_requested);
  const sentThisMonth = sent.filter(
    (a) => (a.review_requested_at ?? "").slice(0, 7) === thisMonthKey,
  ).length;

  // Reuse the appointments' WhatsApp action component: one "Request Review"
  // slot per pending card. Guarded server-side by requestReview().
  const reviewAction = (a: ReviewRow): WaAction[] => {
    const name = a.patient?.full_name ?? "there";
    const number = a.patient?.whatsapp_number ?? "";
    if (!number) return [];
    return [
      {
        kind: "review",
        label: "Request Review",
        state: "available",
        url: waLink(number, reviewMessage(name, reviewUrl)),
      },
    ];
  };

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="Ask happy patients for a Google review after their visit."
      />

      <StatGrid cols={2}>
        <StatCard label="Pending Requests" value={String(pending.length)} />
        <StatCard
          label="Requested This Month"
          value={String(sentThisMonth)}
          tone="success"
        />
      </StatGrid>

      {/* Missing review URL warning */}
      {!reviewUrl ? (
        <div className="mt-4 rounded-card border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm text-text-primary">
            No Google review link is set yet, so the message won&apos;t include
            one. Add it in{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              Settings
            </Link>{" "}
            → Google review URL.
          </p>
        </div>
      ) : null}

      {/* Pending */}
      <SectionHeader hint="Most recent visit first">
        Pending Review Requests
      </SectionHeader>
      <div>
        {pending.length === 0 ? (
          <EmptyState>
            No pending review requests. Completed visits from the last{" "}
            {WINDOW_DAYS} days show up here.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {pending.map((a) => (
              <div
                key={a.id}
                className="flex flex-col gap-3 rounded-card border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-text-primary">
                    {a.patient?.full_name ?? "Unknown"}
                  </p>
                  <p className="mt-0.5 text-sm text-text-secondary">
                    {formatDate(a.appointment_date)} · {formatTime(a.appointment_time)}
                    {a.treatment?.treatment_name
                      ? ` · ${a.treatment.treatment_name}`
                      : ""}
                  </p>
                </div>
                {a.patient?.whatsapp_number ? (
                  <WhatsAppActions id={a.id} actions={reviewAction(a)} />
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

      {/* Recently requested */}
      <SectionHeader hint="Most recent first">Recently Requested</SectionHeader>
      <div>
        {sent.length === 0 ? (
          <EmptyState>No review requests sent yet.</EmptyState>
        ) : (
          <div className="space-y-3">
            {sent.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-white p-4"
              >
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-text-primary">
                  {a.patient?.full_name ?? "Unknown"}
                </span>
                <span className="text-sm text-text-secondary">
                  {formatDate(a.review_requested_at ?? a.appointment_date)}
                </span>
                <span className="inline-flex items-center rounded-button px-2 text-sm font-medium text-success">
                  ✓ Sent
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
