import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, nowIST, addDays } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import {
  RECALL_STATUS,
  humanizeRecallType,
  type RecallStatus,
} from "@/lib/recall-status";
import type { PatientOption, RateCardOption } from "@/lib/types";
import { PageHeader, SectionHeader, EmptyState } from "@/components/page";
import { RecallActions } from "./recall-actions";

type RecallRow = {
  id: string;
  patient_id: string;
  recall_type: string;
  due_date: string;
  status: RecallStatus;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  source: { treatment_name: string } | null;
};

type Tab = "due" | "upcoming" | "completed";
const TABS: { key: Tab; label: string }[] = [
  { key: "due", label: "Due Now" },
  { key: "upcoming", label: "Upcoming" },
  { key: "completed", label: "Completed" },
];

export default async function RecallsPage({
  searchParams,
}: {
  searchParams: { tab?: string };
}) {
  const supabase = createClient();
  const today = nowIST().date;
  const tab: Tab =
    searchParams.tab === "upcoming" || searchParams.tab === "completed"
      ? searchParams.tab
      : "due";

  const select =
    "id, patient_id, recall_type, due_date, status, patient:patient_id(full_name, whatsapp_number), source:source_treatment_id(treatment_name)";

  let listQuery = supabase
    .from("recalls")
    .select(select)
    .order("due_date", { ascending: true });

  if (tab === "due") {
    listQuery = listQuery.in("status", ["pending", "reminded"]).lte("due_date", today);
  } else if (tab === "upcoming") {
    listQuery = listQuery.in("status", ["pending", "reminded"]).gt("due_date", today);
  } else {
    listQuery = listQuery.eq("status", "completed");
  }

  const [listRes, dueCountRes, patientRes, rateCardRes, clinicRes] =
    await Promise.all([
      listQuery,
      supabase
        .from("recalls")
        .select("id", { count: "exact", head: true })
        .in("status", ["pending", "reminded"])
        .lte("due_date", addDays(today, 7)),
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

  const recalls = (listRes.data as unknown as RecallRow[]) ?? [];
  const dueCount = dueCountRes.count ?? 0;
  const patients = (patientRes.data as PatientOption[]) ?? [];
  const rateCards = (rateCardRes.data as RateCardOption[]) ?? [];
  const doctorName = clinicRes.data?.doctor_name ?? "";

  return (
    <div>
      <PageHeader
        title="Recalls"
        subtitle={`${dueCount} recall${dueCount === 1 ? "" : "s"} due within 7 days`}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/recalls?tab=${t.key}`}
            className={`flex h-11 items-center rounded-button px-4 text-[15px] font-medium ${
              tab === t.key
                ? "bg-primary/10 text-primary"
                : "text-text-secondary hover:bg-subtle"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <SectionHeader hint="Earliest due first">
        {TABS.find((t) => t.key === tab)?.label ?? "Recalls"}
      </SectionHeader>

      <div>
        {recalls.length === 0 ? (
          <EmptyState>No recalls in this view.</EmptyState>
        ) : (
          <div className="space-y-3">
            {recalls.map((r) => {
              const name = r.patient?.full_name ?? "Unknown";
              const badge = RECALL_STATUS[r.status];
              const overdue = r.due_date < today;
              const number = r.patient?.whatsapp_number ?? null;
              const remindUrl = number
                ? waLink(
                    number,
                    `Hi ${name} ji, aapka ${humanizeRecallType(r.recall_type)} checkup due hai. Is week appointment book karein? 🦷`,
                  )
                : null;

              return (
                <div
                  key={r.id}
                  className="rounded-card border border-border bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/patients/${r.patient_id}`}
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
                      <p className="mt-1 text-sm text-text-primary">
                        {humanizeRecallType(r.recall_type)}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm">
                        <span
                          className={
                            overdue
                              ? "font-medium text-danger"
                              : "text-text-secondary"
                          }
                        >
                          Due {formatDate(r.due_date)}
                        </span>
                        {r.source?.treatment_name ? (
                          <span className="text-text-secondary">
                            · from {r.source.treatment_name}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {r.status !== "completed" ? (
                    <div className="mt-3 border-t border-border pt-3">
                      <RecallActions
                        view={{
                          id: r.id,
                          patientId: r.patient_id,
                          patientName: name,
                          patientWhatsapp: number,
                          status: r.status,
                          remindUrl,
                        }}
                        patients={patients}
                        rateCards={rateCards}
                        doctorName={doctorName}
                        today={today}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
