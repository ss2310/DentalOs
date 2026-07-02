import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate, nowIST } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { PIPELINE_STAGE, type PipelineStage } from "@/lib/pipeline-stage";
import type { PatientOption, RateCardOption } from "@/lib/types";
import { PipelineToolbar } from "./pipeline-toolbar";
import { CaseActions } from "./case-actions";
import type { RateCard } from "./add-case";

type CaseRow = {
  id: string;
  patient_id: string;
  treatment_id: string | null;
  plan_value: string;
  stage: PipelineStage;
  follow_up_date: string | null;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  treatment: { treatment_name: string } | null;
};

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-5">
      <p className="text-sm text-text-secondary">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold text-text-primary"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export default async function PipelinePage() {
  const supabase = createClient();
  const today = nowIST().date;

  // All RLS-scoped to the caller's clinic.
  const [caseRes, patientRes, rateCardRes, clinicRes] = await Promise.all([
    supabase
      .from("case_pipeline")
      .select(
        "id, patient_id, treatment_id, plan_value, stage, follow_up_date, patient:patient_id(full_name, whatsapp_number), treatment:treatment_id(treatment_name)",
      )
      .order("follow_up_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("patients")
      .select("id, full_name, whatsapp_number, phone")
      .order("full_name", { ascending: true }),
    supabase
      .from("rate_cards")
      .select("id, treatment_name, base_price")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
    supabase.from("clinics").select("doctor_name").single(),
  ]);

  const cases = (caseRes.data as unknown as CaseRow[]) ?? [];
  const patients = (patientRes.data as PatientOption[]) ?? [];
  const rateCards = (rateCardRes.data as RateCard[]) ?? [];
  const doctorName = clinicRes.data?.doctor_name ?? "";

  // Stat cards.
  const pipelineValue = cases.reduce(
    (s, c) =>
      c.stage !== "rejected" && c.stage !== "completed"
        ? s + Number(c.plan_value)
        : s,
    0,
  );
  const needsFollowUp = cases.filter(
    (c) => c.stage === "thinking" && c.follow_up_date && c.follow_up_date <= today,
  ).length;
  const readyToBook = cases.filter((c) => c.stage === "accepted").length;

  return (
    <div>
      <PipelineToolbar patients={patients} rateCards={rateCards} />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Pipeline Value"
          value={formatINR(pipelineValue)}
          color="#059669"
        />
        <StatCard
          label="Needs Follow-up"
          value={String(needsFollowUp)}
          color="#D97706"
        />
        <StatCard
          label="Ready to Book"
          value={String(readyToBook)}
          color="#2563EB"
        />
      </div>

      <div className="mt-6">
        {cases.length === 0 ? (
          <div className="rounded-card border border-border bg-white p-10 text-center">
            <p className="text-[15px] text-text-secondary">
              No treatment cases yet. Add your first case.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cases.map((c) => {
              const name = c.patient?.full_name ?? "Unknown";
              const treatmentName = c.treatment?.treatment_name ?? "Treatment";
              const badge = PIPELINE_STAGE[c.stage];
              const followUpPast =
                !!c.follow_up_date && c.follow_up_date < today;
              const followUpDue =
                c.stage === "thinking" &&
                !!c.follow_up_date &&
                c.follow_up_date <= today;
              const number = c.patient?.whatsapp_number ?? null;
              const followUpUrl =
                followUpDue && number
                  ? waLink(
                      number,
                      `Hi ${name} ji, Dr. ne aapke ${treatmentName} ke baare mein baat ki thi. Kya decision liya? Koi sawal ho toh batayein. 🙏`,
                    )
                  : null;

              return (
                <div
                  key={c.id}
                  className="rounded-card border border-border bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/patients/${c.patient_id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          {name}
                        </Link>
                        <span
                          className={`rounded-pill px-2.5 py-1 text-xs font-medium ${badge.badge}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-text-secondary">
                        {treatmentName} · {formatINR(c.plan_value)}
                      </p>
                      {c.follow_up_date ? (
                        <p
                          className={`mt-0.5 text-sm ${
                            followUpPast
                              ? "font-medium text-danger"
                              : "text-text-secondary"
                          }`}
                        >
                          Follow-up: {formatDate(c.follow_up_date)}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-3 border-t border-border pt-3">
                    <CaseActions
                      view={{
                        id: c.id,
                        patientId: c.patient_id,
                        patientName: name,
                        patientWhatsapp: number,
                        stage: c.stage,
                        followUpDue,
                        followUpUrl,
                      }}
                      patients={patients}
                      rateCards={rateCards as RateCardOption[]}
                      doctorName={doctorName}
                      today={today}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
