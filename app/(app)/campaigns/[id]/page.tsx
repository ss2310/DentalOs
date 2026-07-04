import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatINR, nowIST, addDays } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { PageHeader, SectionHeader, EmptyState } from "@/components/page";
import { segmentLabel, fillCampaignTemplate } from "../segments";
import { SendButton, MarkDoneButton } from "./campaign-controls";

export const dynamic = "force-dynamic";

// Patients messaged (any campaign) within this many days get the "recently
// messaged" guardrail so the clinic doesn't over-contact them.
const RECENT_DAYS = 14;

type Campaign = {
  id: string;
  name: string;
  segment_type: string;
  status: "draft" | "active" | "done";
  message_template: string;
  segment_filter: { patient_ids?: string[]; treatment_id?: string } | null;
};

type Patient = {
  id: string;
  full_name: string;
  whatsapp_number: string | null;
  phone: string | null;
  last_visit_date: string | null;
  total_outstanding: number | string;
  date_of_birth: string | null;
};

function relevance(segment: string, p: Patient): string {
  switch (segment) {
    case "outstanding_balance":
      return `Balance: ${formatINR(p.total_outstanding)}`;
    case "birthday_month":
      return p.date_of_birth ? `Birthday: ${formatDate(p.date_of_birth)}` : "";
    default:
      return p.last_visit_date
        ? `Last visit: ${formatDate(p.last_visit_date)}`
        : "No visits recorded";
  }
}

export default async function CampaignDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  const { data: campaignData } = await supabase
    .from("campaigns")
    .select("id, name, segment_type, status, message_template, segment_filter")
    .eq("id", params.id)
    .maybeSingle();
  const campaign = campaignData as Campaign | null;
  if (!campaign) notFound();

  const recipientIds = campaign.segment_filter?.patient_ids ?? [];
  const { date: today } = nowIST();
  const recentCutoff = `${addDays(today, -RECENT_DAYS)}T00:00:00`;

  const [patientRes, sendRes, recentRes, clinicRes] = await Promise.all([
    recipientIds.length
      ? supabase
          .from("patients")
          .select(
            "id, full_name, whatsapp_number, phone, last_visit_date, total_outstanding, date_of_birth",
          )
          .in("id", recipientIds)
      : Promise.resolve({ data: [] as Patient[] }),
    // Who in THIS campaign has already been sent to.
    supabase
      .from("campaign_sends")
      .select("patient_id")
      .eq("campaign_id", campaign.id)
      .not("sent_at", "is", null),
    // Guardrail: anyone messaged by ANY campaign in the last 14 days.
    supabase
      .from("campaign_sends")
      .select("patient_id")
      .not("sent_at", "is", null)
      .gte("sent_at", recentCutoff),
    supabase
      .from("clinics")
      .select("business_name, doctor_name, phone")
      .single(),
  ]);

  const patientsById = new Map(
    ((patientRes.data as Patient[]) ?? []).map((p) => [p.id, p]),
  );
  // Preserve the snapshot order from segment_filter.
  const patients = recipientIds
    .map((id) => patientsById.get(id))
    .filter((p): p is Patient => !!p);

  const sentSet = new Set(
    ((sendRes.data as { patient_id: string }[]) ?? []).map((s) => s.patient_id),
  );
  const recentSet = new Set(
    ((recentRes.data as { patient_id: string }[]) ?? []).map(
      (s) => s.patient_id,
    ),
  );

  const clinic = clinicRes.data ?? {
    business_name: "",
    doctor_name: "",
    phone: "",
  };

  const total = patients.length;
  const sent = patients.filter((p) => sentSet.has(p.id)).length;
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  const done = campaign.status === "done";

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={`${segmentLabel(campaign.segment_type)} · ${total} patient${
          total === 1 ? "" : "s"
        }`}
        action={done ? undefined : <MarkDoneButton campaignId={campaign.id} />}
      />

      {/* Progress */}
      <div className="mt-5 rounded-card border border-border bg-white p-5 shadow-card">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-text-primary">
            {sent} of {total} sent
          </span>
          <span className="text-text-secondary">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-pill bg-subtle">
          <div
            className="h-full rounded-pill bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {done ? (
          <p className="mt-3 text-sm font-medium text-success">
            ✓ Campaign marked done.
          </p>
        ) : null}
      </div>

      <SectionHeader hint="One tap per patient">Recipients</SectionHeader>
      <div>
        {patients.length === 0 ? (
          <EmptyState>
            No patients matched this segment when the campaign was created.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {patients.map((p) => {
              const number = p.whatsapp_number ?? p.phone ?? "";
              const filled = fillCampaignTemplate(campaign.message_template, {
                name: p.full_name,
                clinic: clinic.business_name ?? "",
                doctor: clinic.doctor_name ?? "",
                phone: clinic.phone ?? "",
              });
              const waUrl = number ? waLink(number, filled) : null;
              const isSent = sentSet.has(p.id);
              const recentlyMessaged = !isSent && recentSet.has(p.id);

              return (
                <div
                  key={p.id}
                  className="flex flex-col gap-3 rounded-card border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-medium text-text-primary">
                        {p.full_name}
                      </span>
                      {recentlyMessaged ? (
                        <span className="inline-flex items-center rounded-pill border border-warning/30 bg-warning/5 px-2 py-0.5 text-xs font-medium text-warning">
                          recently messaged
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {number ? `+91 ${number}` : "No number"}
                      {relevance(campaign.segment_type, p)
                        ? ` · ${relevance(campaign.segment_type, p)}`
                        : ""}
                    </p>
                  </div>
                  <SendButton
                    campaignId={campaign.id}
                    patientId={p.id}
                    waUrl={waUrl}
                    sent={isSent}
                    disabled={done}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
