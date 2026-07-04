import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatINR, formatDate, nowIST } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { PIPELINE_STAGE, type PipelineStage } from "@/lib/pipeline-stage";
import type { PatientOption, RateCardOption } from "@/lib/types";
import {
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import { PipelineToolbar } from "./pipeline-toolbar";
import { CaseActions } from "./case-actions";
import { PipelineTabs } from "./pipeline-tabs";
import { PipelineBoard, type BoardCase } from "./pipeline-board";
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

  // Group cases by stage, most actionable first. Cases arrive already sorted by
  // follow-up date (soonest first), so ordering is preserved within each group.
  const STAGE_ORDER: PipelineStage[] = [
    "accepted",
    "thinking",
    "presented",
    "identified",
    "scheduled",
    "completed",
    "rejected",
  ];
  const grouped = STAGE_ORDER.map((stage) => ({
    stage,
    items: cases.filter((c) => c.stage === stage),
  })).filter((g) => g.items.length > 0);

  // Flattened, serialisable shape for the Board view (client component).
  const boardCases: BoardCase[] = cases.map((c) => ({
    id: c.id,
    patientId: c.patient_id,
    patientName: c.patient?.full_name ?? "Unknown",
    patientWhatsapp: c.patient?.whatsapp_number ?? null,
    treatmentName: c.treatment?.treatment_name ?? "Treatment",
    planValue: Number(c.plan_value),
    stage: c.stage,
    followUpDate: c.follow_up_date,
  }));

  const renderCase = (c: CaseRow) => {
    const name = c.patient?.full_name ?? "Unknown";
    const treatmentName = c.treatment?.treatment_name ?? "Treatment";
    const badge = PIPELINE_STAGE[c.stage];
    const followUpPast = !!c.follow_up_date && c.follow_up_date < today;
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
  };

  return (
    <div>
      <PipelineToolbar patients={patients} rateCards={rateCards} />

      <StatGrid>
        <StatCard
          label="Plan Value"
          value={formatINR(pipelineValue)}
          tone="success"
        />
        <StatCard
          label="Needs Follow-up"
          value={String(needsFollowUp)}
          tone="warning"
        />
        <StatCard
          label="Ready to Book"
          value={String(readyToBook)}
          tone="primary"
        />
      </StatGrid>

      {cases.length === 0 ? (
        <>
          <SectionHeader>Treatment Cases</SectionHeader>
          <EmptyState>No treatment cases yet. Add your first case.</EmptyState>
        </>
      ) : (
        <PipelineTabs
          list={grouped.map((g) => (
            <div key={g.stage}>
              <SectionHeader
                hint={`${g.items.length} ${g.items.length === 1 ? "case" : "cases"}`}
              >
                {PIPELINE_STAGE[g.stage].label}
              </SectionHeader>
              <div className="space-y-3">{g.items.map(renderCase)}</div>
            </div>
          ))}
          board={
            <PipelineBoard
              cases={boardCases}
              patients={patients}
              rateCards={rateCards as RateCardOption[]}
              doctorName={doctorName}
              today={today}
            />
          }
        />
      )}
    </div>
  );
}
