import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WhatsAppIcon } from "@/components/icons";
import { formatDate, formatINR, calcAge } from "@/lib/format";
import { AGE_BUCKET, type AgeBucket } from "@/lib/age-bucket";
import { PIPELINE_STAGE, type PipelineStage } from "@/lib/pipeline-stage";
import {
  RECALL_STATUS,
  humanizeRecallType,
  type RecallStatus,
} from "@/lib/recall-status";
import type { Patient, VisitLog, Recall } from "@/lib/types";
import { EditPatientButton } from "./edit-patient-button";
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

const PAYMENT_BADGE: Record<VisitLog["payment_status"], string> = {
  paid: "bg-success/10 text-success",
  partial: "bg-warning/10 text-warning",
  pending: "bg-danger/10 text-danger",
};

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

export default async function PatientDetailPage({
  params,
}: {
  params: { id: string };
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
    supabase.from("clinics").select("business_name, doctor_name, phone").single(),
  ]);

  const visits = (visitRows as VisitLog[]) ?? [];
  const cases = (caseRows as unknown as DetailCase[]) ?? [];
  const recalls = (recallRows as Recall[]) ?? [];
  const balances = (balanceRows as unknown as OpenBalance[]) ?? [];
  const plans = (planRows as unknown as SavedPlan[]) ?? [];
  const rateCards =
    (rateCardRows as { id: string; treatment_name: string; base_price: string }[]) ??
    [];

  const age = calcAge(patient.date_of_birth);
  const whatsapp = patient.whatsapp_number ?? patient.phone;
  const outstanding = Number(patient.total_outstanding) || 0;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/patients"
        className="text-sm font-medium text-text-secondary hover:text-text-primary"
      >
        ← Patients
      </Link>

      {/* (a) Header card */}
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
          <EditPatientButton patient={patient} />
        </div>
      </div>

      {/* (b) Stats row */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">Total visits</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {patient.total_visits}
          </p>
        </div>
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">Lifetime revenue</p>
          <p className="mt-1 text-2xl font-semibold text-text-primary">
            {formatINR(patient.lifetime_revenue)}
          </p>
        </div>
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">Outstanding</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              outstanding > 0 ? "text-danger" : "text-text-primary"
            }`}
          >
            {formatINR(patient.total_outstanding)}
          </p>
        </div>
      </div>

      {/* Treatment Plan */}
      <div className="mt-8">
        <TreatmentPlans
          patientId={patient.id}
          patientName={patient.full_name}
          patientWhatsapp={whatsapp}
          doctorName={clinicRow?.doctor_name ?? ""}
          clinicName={clinicRow?.business_name ?? ""}
          clinicPhone={clinicRow?.phone ?? ""}
          rateCards={rateCards}
          plans={plans}
        />
      </div>

      {/* Outstanding balances */}
      <div className="mt-8">
        <SectionHeader>Outstanding Balances</SectionHeader>
        {balances.length === 0 ? (
          <EmptyCard text="No outstanding balances." />
        ) : (
          <div className="space-y-3">
            {balances.map((b) => {
              const badge = AGE_BUCKET[b.age_bucket];
              return (
                <div
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-card border border-border bg-white p-4"
                >
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
              );
            })}
          </div>
        )}
      </div>

      {/* (c) Visit history */}
      <div className="mt-8">
        <SectionHeader>Visit History</SectionHeader>
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

      {/* (d) Pipeline cases */}
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

      {/* (e) Recalls */}
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
    </div>
  );
}
