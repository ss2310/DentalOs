import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppIcon } from "@/components/icons";
import { StatGrid, StatCard } from "@/components/page";
import { TabBar, type TabDef } from "@/components/tabs";
import { formatDate, formatINR, calcAge } from "@/lib/format";
import { AGE_BUCKET, type AgeBucket } from "@/lib/age-bucket";
import { PIPELINE_STAGE, type PipelineStage } from "@/lib/pipeline-stage";
import {
  RECALL_STATUS,
  humanizeRecallType,
  type RecallStatus,
} from "@/lib/recall-status";
import type { Patient, VisitLog, Recall, ClinicNote } from "@/lib/types";
import { voiceNotesEnabledForClinic } from "@/lib/voice-notes-access";
import { VoiceNotesPanel } from "@/components/voice-notes-panel";
import { EditPatientButton } from "./edit-patient-button";
import { AddVisitButton } from "./add-visit-modal";
import { RecordPaymentButton } from "./record-payment-button";
import { TreatmentPlans, type SavedPlan } from "./treatment-plans";

type OpenBalance = {
  id: string;
  nett_due: string;
  total_amount: string;
  age_bucket: AgeBucket;
  visit: { visit_date: string; treatment_name_text: string } | null;
};

type DetailCase = {
  id: string;
  plan_value: string;
  stage: PipelineStage;
  follow_up_date: string | null;
  treatment: { treatment_name: string } | null;
};

type PaymentRow = {
  id: string;
  amount: string;
  payment_mode: string;
  payment_date: string;
  visit: { treatment_name_text: string | null } | null;
};

const PAYMENT_BADGE: Record<VisitLog["payment_status"], string> = {
  paid: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  pending: "bg-danger/10 text-danger",
};

const MODE_LABEL: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  insurance: "Insurance",
};

// Pipeline stages that still count toward "plan value on the table".
const CLOSED_STAGES: ReadonlySet<string> = new Set(["completed", "rejected"]);

const PROFILE_TABS: TabDef[] = [
  { id: "overview", label: "Overview" },
  { id: "plans", label: "Treatments & Plans" },
  { id: "visits", label: "Visits" },
  { id: "payments", label: "Payments" },
];

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-text-secondary">
      {children}
    </h2>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-card border border-border bg-white p-6 text-center text-sm text-text-secondary">
      {text}
    </div>
  );
}

/** Open balances list, with Record Payment right on each row (052). Shared by
 *  the Overview and Payments tabs. */
function OpenBalances({
  balances,
  patientName,
}: {
  balances: OpenBalance[];
  patientName: string;
}) {
  if (balances.length === 0) {
    return <EmptyCard text="No outstanding balances." />;
  }
  return (
    <div className="space-y-3">
      {balances.map((b) => {
        const badge = AGE_BUCKET[b.age_bucket];
        return (
          <div
            key={b.id}
            className="rounded-card border border-border bg-white p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-text-primary">
                  {b.visit?.treatment_name_text ?? "Balance"}
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                  <span>{formatDate(b.visit?.visit_date)}</span>
                  <span
                    className={`rounded-pill px-2 py-0.5 text-xs font-medium ${badge.badge}`}
                  >
                    {badge.label}
                  </span>
                </div>
              </div>
              <span className="font-bold text-danger">
                {formatINR(b.nett_due)}
              </span>
            </div>
            <div className="mt-3 border-t border-border pt-3">
              <RecordPaymentButton
                outstandingId={b.id}
                patientName={patientName}
                nettDue={Number(b.nett_due) || 0}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { tab?: string };
}) {
  const supabase = createClient();

  // RLS scopes every query below to the caller's clinic.
  const { data: patientRow } = await supabase
    .from("patients")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!patientRow) notFound();
  const patient = patientRow as Patient;

  const [
    { data: visitRows },
    { data: caseRows },
    { data: recallRows },
    { data: balanceRows },
    { data: planRows },
    { data: rateCardRows },
    { data: clinicRow },
    { data: noteRows },
    { data: followupRows },
    { data: paymentRows },
  ] = await Promise.all([
    supabase
      .from("visit_logs")
      .select("id, visit_date, treatment_name_text, cost, amount_paid, payment_status, doctor")
      .eq("patient_id", patient.id)
      .order("visit_date", { ascending: false }),
    supabase
      .from("case_pipeline")
      .select(
        "id, plan_value, stage, follow_up_date, treatment:treatment_id(treatment_name)",
      )
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("recalls")
      .select("id, recall_type, due_date, status")
      .eq("patient_id", patient.id)
      .order("due_date", { ascending: true }),
    supabase
      .from("outstandings")
      .select(
        "id, nett_due, total_amount, age_bucket, visit:visit_log_id(visit_date, treatment_name_text)",
      )
      .eq("patient_id", patient.id)
      .gt("nett_due", 0)
      .order("nett_due", { ascending: false }),
    supabase
      .from("treatment_plans")
      .select("id, plan_name, items, total_cost, sent_to_patient, created_at")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("rate_cards")
      .select("id, treatment_name, base_price")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
    supabase
      .from("clinics")
      .select("business_name, doctor_name, phone, upi_id, feature_flags")
      .single(),
    supabase
      .from("clinic_notes")
      .select(
        "id, patient_id, raw_transcript, note_text, tags, status, extraction, created_at, updated_at",
      )
      .eq("patient_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("followup_tasks")
      .select("id, description, due_date, status, created_at")
      .eq("patient_id", params.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // Payments ledger (052). Before the migration runs this select errors and
    // data is null — the `?? []` below keeps the page rendering.
    supabase
      .from("payments")
      .select(
        "id, amount, payment_mode, payment_date, visit:visit_log_id(treatment_name_text)",
      )
      .eq("patient_id", params.id)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  const visits = (visitRows as VisitLog[]) ?? [];
  const cases = (caseRows as unknown as DetailCase[]) ?? [];
  const recalls = (recallRows as Recall[]) ?? [];
  const balances = (balanceRows as unknown as OpenBalance[]) ?? [];
  const plans = (planRows as unknown as SavedPlan[]) ?? [];
  const payments = (paymentRows as unknown as PaymentRow[]) ?? [];
  const rateCards =
    (rateCardRows as { id: string; treatment_name: string; base_price: string }[]) ??
    [];
  const voiceEnabled = voiceNotesEnabledForClinic(
    (clinicRow as { feature_flags?: Record<string, unknown> } | null)?.feature_flags,
  );
  const notes = (noteRows as unknown as ClinicNote[]) ?? [];
  const followups =
    (followupRows as {
      id: string;
      description: string;
      due_date: string | null;
      status: string;
      created_at: string;
    }[]) ?? [];

  const age = calcAge(patient.date_of_birth);
  const whatsapp = patient.whatsapp_number ?? patient.phone;
  const outstanding = Number(patient.total_outstanding) || 0;

  // "Plan value on the table": open pipeline cases + plans not yet sent.
  const planValue =
    cases
      .filter((c) => !CLOSED_STAGES.has(c.stage))
      .reduce((s, c) => s + (Number(c.plan_value) || 0), 0) +
    plans
      .filter((p) => !p.sent_to_patient)
      .reduce((s, p) => s + (Number(p.total_cost) || 0), 0);

  const requestedTab = searchParams?.tab ?? "overview";
  const tab = PROFILE_TABS.some((t) => t.id === requestedTab)
    ? requestedTab
    : "overview";
  const tabs = PROFILE_TABS.map((t) => ({
    ...t,
    count:
      t.id === "plans"
        ? plans.length + cases.length
        : t.id === "visits"
          ? visits.length
          : t.id === "payments"
            ? payments.length
            : undefined,
  }));

  const addVisitButton = (
    <AddVisitButton
      patientId={patient.id}
      rateCards={rateCards}
      defaultDoctor={clinicRow?.doctor_name ?? ""}
    />
  );

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/patients"
        className="text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        ← Patients
      </Link>

      {/* (a) Header card — identity + the two primary actions. */}
      <div className="mt-3 rounded-card border border-border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">
              {patient.full_name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
              {age !== null ? <span>{age} yrs</span> : null}
              {patient.gender ? <span>{patient.gender}</span> : null}
              {patient.area ? <span>{patient.area}</span> : null}
            </div>
            {visits.length > 0 ? (
              <p className="mt-2 text-sm text-text-secondary">
                Last visit:{" "}
                <span className="font-medium text-text-primary">
                  {formatDate(visits[0].visit_date)}
                </span>
                {visits[0].treatment_name_text
                  ? ` · ${visits[0].treatment_name_text}`
                  : ""}
              </p>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">
                No visits recorded yet.
              </p>
            )}
            {whatsapp ? (
              <a
                href={`https://wa.me/91${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex h-11 items-center gap-2 rounded-button border border-border px-3 text-[15px] font-medium text-text-primary hover:bg-subtle"
              >
                <span className="text-success">
                  <WhatsAppIcon />
                </span>
                {whatsapp}
              </a>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {addVisitButton}
            <EditPatientButton patient={patient} />
          </div>
        </div>
      </div>

      {/* (b) Stats row — always visible above the tabs. */}
      <StatGrid cols={4}>
        <StatCard label="Total visits" value={String(patient.total_visits)} />
        <StatCard
          label="Lifetime revenue"
          value={formatINR(patient.lifetime_revenue)}
        />
        <StatCard
          label="Outstanding"
          value={formatINR(patient.total_outstanding)}
          tone={outstanding > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Plan value"
          value={formatINR(planValue)}
          tone={planValue > 0 ? "primary" : "default"}
          hint={planValue > 0 ? "Open plans & pipeline" : undefined}
        />
      </StatGrid>

      {/* (c) Tabs — state lives in ?tab= so refresh/back keep the view. */}
      <div className="mt-6">
        <TabBar
          tabs={tabs}
          active={tab}
          hrefFor={(id) => `/patients/${patient.id}?tab=${id}`}
        />
      </div>

      {tab === "overview" ? (
        <>
          {voiceEnabled ? (
            <div className="mt-8">
              <VoiceNotesPanel patientId={patient.id} initialNotes={notes} />
            </div>
          ) : null}

          {voiceEnabled ? (
            <div className="mt-8">
              <SectionHeader>Follow-ups</SectionHeader>
              {followups.length === 0 ? (
                <EmptyCard text="No follow-up tasks yet. Confirm a voice note to create one." />
              ) : (
                <div className="space-y-3">
                  {followups.map((f) => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-3 rounded-card border border-border bg-white p-4"
                    >
                      <div>
                        <p className="font-medium text-text-primary">
                          {f.description}
                        </p>
                        {f.due_date ? (
                          <p className="mt-0.5 text-sm text-text-secondary">
                            Due: {formatDate(f.due_date)}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={`rounded-pill px-2.5 py-1 text-xs font-medium ${
                          f.status === "done"
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning"
                        }`}
                      >
                        {f.status === "done" ? "Done" : "Open"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="mt-8">
            <SectionHeader>Outstanding Balances</SectionHeader>
            <OpenBalances balances={balances} patientName={patient.full_name} />
          </div>

          <div className="mt-8">
            <SectionHeader>Recalls</SectionHeader>
            {recalls.length === 0 ? (
              <EmptyCard text="No recalls scheduled." />
            ) : (
              <div className="space-y-3">
                {recalls.map((r) => {
                  const badge = RECALL_STATUS[r.status as RecallStatus];
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-card border border-border bg-white p-4"
                    >
                      <div>
                        <p className="font-medium text-text-primary">
                          {humanizeRecallType(r.recall_type)}
                        </p>
                        <p className="mt-0.5 text-sm text-text-secondary">
                          Due: {formatDate(r.due_date)}
                        </p>
                      </div>
                      <span
                        className={`rounded-pill px-2.5 py-1 text-xs font-medium ${badge.badge}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {tab === "plans" ? (
        <>
          <div className="mt-8">
            <TreatmentPlans
              patientId={patient.id}
              patientName={patient.full_name}
              patientWhatsapp={whatsapp}
              doctorName={clinicRow?.doctor_name ?? ""}
              clinicName={clinicRow?.business_name ?? ""}
              clinicPhone={clinicRow?.phone ?? ""}
              upiId={clinicRow?.upi_id?.trim() || null}
              rateCards={rateCards}
              plans={plans}
            />
          </div>

          <div className="mt-8">
            <SectionHeader>Pipeline Cases</SectionHeader>
            {cases.length === 0 ? (
              <EmptyCard text="No treatment cases in the pipeline." />
            ) : (
              <div className="space-y-3">
                {cases.map((c) => {
                  const badge = PIPELINE_STAGE[c.stage];
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-3 rounded-card border border-border bg-white p-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-text-primary">
                            {c.treatment?.treatment_name ?? "Treatment"}
                          </p>
                          <span
                            className={`rounded-pill px-2 py-0.5 text-xs font-medium ${badge.badge}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        {c.follow_up_date ? (
                          <p className="mt-0.5 text-sm text-text-secondary">
                            Follow-up: {formatDate(c.follow_up_date)}
                          </p>
                        ) : null}
                      </div>
                      <span className="text-[15px] font-medium text-text-primary">
                        {formatINR(c.plan_value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}

      {tab === "visits" ? (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
              Visit History
            </h2>
            {addVisitButton}
          </div>
          {visits.length === 0 ? (
            <EmptyCard text="No visits recorded yet." />
          ) : (
            <div className="space-y-3">
              {visits.map((v) => (
                <div
                  key={v.id}
                  className="rounded-card border border-border bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">
                        {v.treatment_name_text}
                      </p>
                      <p className="mt-0.5 text-sm text-text-secondary">
                        {formatDate(v.visit_date)}
                        {v.doctor ? ` · ${v.doctor}` : ""}
                      </p>
                    </div>
                    <span
                      className={`rounded-pill px-2.5 py-1 text-xs font-medium capitalize ${PAYMENT_BADGE[v.payment_status]}`}
                    >
                      {v.payment_status}
                    </span>
                  </div>
                  <div className="mt-2 flex gap-4 text-sm text-text-secondary">
                    <span>Cost: {formatINR(v.cost)}</span>
                    <span>Paid: {formatINR(v.amount_paid)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {tab === "payments" ? (
        <>
          <div className="mt-8">
            <SectionHeader>Payment History</SectionHeader>
            {payments.length === 0 ? (
              <EmptyCard text="No payments recorded yet. Payments are tracked from visits and recorded dues." />
            ) : (
              <div className="space-y-3">
                {payments.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-card border border-border bg-white p-4"
                  >
                    <div>
                      <p className="font-medium text-text-primary">
                        {p.visit?.treatment_name_text ?? "Payment"}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
                        <span>{formatDate(p.payment_date)}</span>
                        <span className="rounded-pill bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                          {MODE_LABEL[p.payment_mode] ?? p.payment_mode}
                        </span>
                      </div>
                    </div>
                    <span className="font-semibold text-success">
                      {formatINR(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8">
            <SectionHeader>Outstanding Balances</SectionHeader>
            <OpenBalances balances={balances} patientName={patient.full_name} />
          </div>
        </>
      ) : null}
    </div>
  );
}
