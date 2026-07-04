import type { SupabaseClient } from "@supabase/supabase-js";
import { nowIST, addDays } from "@/lib/format";

// The five targetable segments (the DB enum also has 'custom', unused here).
// Each maps a clinic's patient book to a recallable audience. Kept in one place
// so the New Campaign preview, the save-time snapshot, and the detail page all
// agree on who is in a segment.
export type SegmentType =
  | "dormant_6mo"
  | "dormant_12mo"
  | "treatment_followup"
  | "outstanding_balance"
  | "birthday_month";

export type SegmentMeta = {
  value: SegmentType;
  label: string;
  help: string;
  needsTreatment?: boolean;
};

export const SEGMENTS: SegmentMeta[] = [
  {
    value: "dormant_6mo",
    label: "Dormant 6 months",
    help: "No visit in the last 6 months (or added over 6 months ago, never seen).",
  },
  {
    value: "dormant_12mo",
    label: "Dormant 12 months",
    help: "No visit in the last 12 months.",
  },
  {
    value: "treatment_followup",
    label: "Treatment follow-up",
    help: "Patients whose most recent visit was the treatment you pick.",
    needsTreatment: true,
  },
  {
    value: "outstanding_balance",
    label: "Outstanding balance",
    help: "Patients who still owe a balance.",
  },
  {
    value: "birthday_month",
    label: "Birthday this month",
    help: "Patients whose birthday falls in the current month.",
  },
];

export const SEGMENT_VALUES = new Set<SegmentType>(SEGMENTS.map((s) => s.value));

export function segmentLabel(value: string): string {
  return SEGMENTS.find((s) => s.value === value)?.label ?? value;
}

// The variables a message template may use. Kept short + literal so a
// receptionist can hand-type them: {name} {clinic} {doctor} {phone}.
export const TEMPLATE_VARS = ["name", "clinic", "doctor", "phone"] as const;

/** Fills {name}/{clinic}/{doctor}/{phone} in a template. Unknown braces are left. */
export function fillCampaignTemplate(
  template: string,
  vars: { name?: string; clinic?: string; doctor?: string; phone?: string },
): string {
  return template.replace(/\{(name|clinic|doctor|phone)\}/g, (_, k: string) =>
    (vars as Record<string, string | undefined>)[k] ?? "",
  );
}

export type SegmentPatient = {
  id: string;
  full_name: string;
  whatsapp_number: string | null;
  phone: string | null;
  last_visit_date: string | null;
  total_outstanding: number | string;
  date_of_birth: string | null;
};

const PATIENT_COLS =
  "id, full_name, whatsapp_number, phone, last_visit_date, total_outstanding, date_of_birth, created_at";

/**
 * Resolves the patients in a segment for the caller's clinic. All queries are
 * RLS-scoped, so no clinic_id is needed here — the session's clinic is implicit.
 * Returns [] for an unknown segment or a treatment_followup with no treatment.
 */
export async function resolveSegmentPatients(
  supabase: SupabaseClient,
  segment: SegmentType,
  treatmentId?: string,
): Promise<SegmentPatient[]> {
  const { date: today } = nowIST();

  // Dormant = last visit older than the cutoff, OR never seen but on the books
  // for longer than the cutoff (so brand-new patients aren't nagged).
  const dormant = async (days: number): Promise<SegmentPatient[]> => {
    const cut = addDays(today, -days);
    const cutTs = `${cut}T00:00:00`;
    const { data } = await supabase
      .from("patients")
      .select(PATIENT_COLS)
      .or(
        `last_visit_date.lt.${cut},and(last_visit_date.is.null,created_at.lt.${cutTs})`,
      );
    return (data ?? []) as SegmentPatient[];
  };

  switch (segment) {
    case "dormant_6mo":
      return dormant(180);

    case "dormant_12mo":
      return dormant(365);

    case "outstanding_balance": {
      const { data } = await supabase
        .from("patients")
        .select(PATIENT_COLS)
        .gt("total_outstanding", 0);
      return (data ?? []) as SegmentPatient[];
    }

    case "birthday_month": {
      // Postgres can't index-filter by month via PostgREST cleanly, so match the
      // MM of the DOB in JS (bounded by one clinic's patient book).
      const mm = today.slice(5, 7);
      const { data } = await supabase
        .from("patients")
        .select(PATIENT_COLS)
        .not("date_of_birth", "is", null);
      return ((data ?? []) as SegmentPatient[]).filter(
        (p) => (p.date_of_birth ?? "").slice(5, 7) === mm,
      );
    }

    case "treatment_followup": {
      if (!treatmentId) return [];
      // Latest visit per patient, newest first; keep only those whose most
      // recent visit used the chosen treatment.
      const { data: logs } = await supabase
        .from("visit_logs")
        .select("patient_id, visit_date, treatment_id")
        .order("visit_date", { ascending: false });
      // First occurrence per patient = their latest visit (rows are desc). Keep
      // those whose latest visit used the chosen treatment.
      const seen = new Set<string>();
      const ids: string[] = [];
      for (const l of (logs ?? []) as {
        patient_id: string;
        treatment_id: string | null;
      }[]) {
        if (seen.has(l.patient_id)) continue;
        seen.add(l.patient_id);
        if (l.treatment_id === treatmentId) ids.push(l.patient_id);
      }
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from("patients")
        .select(PATIENT_COLS)
        .in("id", ids);
      return (data ?? []) as SegmentPatient[];
    }

    default:
      return [];
  }
}
