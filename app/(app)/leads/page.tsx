import { createClient } from "@/lib/supabase/server";
import { formatDate, nowIST } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import {
  LEAD_STATUS,
  LEAD_SOURCE_LABEL,
  type LeadStatus,
} from "@/lib/lead-badges";
import {
  StatGrid,
  StatCard,
  SectionHeader,
  EmptyState,
} from "@/components/page";
import { LeadsToolbar } from "./leads-toolbar";
import { LeadActions } from "./lead-actions";

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  source: string;
  treatment_interest: string | null;
  status: LeadStatus;
  follow_up_date: string | null;
  created_at: string;
};

export default async function LeadsPage() {
  const supabase = createClient();
  const today = nowIST().date;
  const monthStart = `${today.slice(0, 7)}-01`;

  const { data } = await supabase
    .from("lead_logs")
    .select(
      "id, name, phone, source, treatment_interest, status, follow_up_date, created_at",
    )
    .order("created_at", { ascending: false });

  const leads = (data as LeadRow[]) ?? [];

  const newCount = leads.filter((l) => l.status === "new").length;
  const contactedCount = leads.filter((l) => l.status === "contacted").length;
  const convertedThisMonth = leads.filter(
    (l) => l.status === "converted" && l.created_at.slice(0, 10) >= monthStart,
  ).length;

  // Group leads by status, newest-first within each (query already sorts by
  // created_at desc). Open/actionable statuses lead; closed ones sink.
  const STATUS_ORDER: LeadStatus[] = [
    "new",
    "contacted",
    "interested",
    "booked",
    "converted",
    "lost",
  ];
  const grouped = STATUS_ORDER.map((status) => ({
    status,
    items: leads.filter((l) => l.status === status),
  })).filter((g) => g.items.length > 0);

  const renderLead = (l: LeadRow) => {
    const badge = LEAD_STATUS[l.status];
    const followUpPast = !!l.follow_up_date && l.follow_up_date < today;
    const contactUrl = l.phone
      ? waLink(
          l.phone,
          `Namaste ${l.name} ji, aapne ${l.treatment_interest ?? "treatment"} ke liye enquiry ki thi. Kab baat kar sakte hain? 🙏`,
        )
      : null;

    return (
      <div
        key={l.id}
        className="rounded-card border border-border bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-text-primary">{l.name}</span>
              <span
                className={`rounded-pill px-2.5 py-1 text-xs font-medium ${badge.badge}`}
              >
                {badge.label}
              </span>
              <span className="rounded-pill bg-subtle px-2 py-0.5 text-xs font-medium text-text-secondary">
                {LEAD_SOURCE_LABEL[l.source] ?? l.source}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
              {l.phone ? <span>{l.phone}</span> : null}
              {l.treatment_interest ? <span>{l.treatment_interest}</span> : null}
              {l.follow_up_date ? (
                <span className={followUpPast ? "font-medium text-danger" : ""}>
                  Follow-up: {formatDate(l.follow_up_date)}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 border-t border-border pt-3">
          <LeadActions view={{ id: l.id, status: l.status, contactUrl }} />
        </div>
      </div>
    );
  };

  return (
    <div>
      <LeadsToolbar />

      <StatGrid>
        <StatCard label="New" value={String(newCount)} tone="primary" />
        <StatCard
          label="Contacted"
          value={String(contactedCount)}
          tone="warning"
        />
        <StatCard
          label="Converted (This Month)"
          value={String(convertedThisMonth)}
          tone="success"
        />
      </StatGrid>

      {leads.length === 0 ? (
        <>
          <SectionHeader>All Leads</SectionHeader>
          <EmptyState>No leads yet. Add your first lead.</EmptyState>
        </>
      ) : (
        grouped.map((g) => (
          <div key={g.status}>
            <SectionHeader
              hint={`${g.items.length} ${g.items.length === 1 ? "lead" : "leads"}`}
            >
              {LEAD_STATUS[g.status].label}
            </SectionHeader>
            <div className="space-y-3">{g.items.map(renderLead)}</div>
          </div>
        ))
      )}
    </div>
  );
}
