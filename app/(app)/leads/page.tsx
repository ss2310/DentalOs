import { createClient } from "@/lib/supabase/server";
import { formatDate, nowIST } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import {
  LEAD_STATUS,
  LEAD_SOURCE_LABEL,
  type LeadStatus,
} from "@/lib/lead-badges";
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

  return (
    <div>
      <LeadsToolbar />

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="New" value={String(newCount)} color="#2563EB" />
        <StatCard
          label="Contacted"
          value={String(contactedCount)}
          color="#D97706"
        />
        <StatCard
          label="Converted (This Month)"
          value={String(convertedThisMonth)}
          color="#059669"
        />
      </div>

      <div className="mt-6">
        {leads.length === 0 ? (
          <div className="rounded-card border border-border bg-white p-10 text-center">
            <p className="text-[15px] text-text-secondary">
              No leads yet. Add your first lead.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((l) => {
              const badge = LEAD_STATUS[l.status];
              const followUpPast =
                !!l.follow_up_date && l.follow_up_date < today;
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
                        <span className="font-semibold text-text-primary">
                          {l.name}
                        </span>
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
                        {l.treatment_interest ? (
                          <span>{l.treatment_interest}</span>
                        ) : null}
                        {l.follow_up_date ? (
                          <span
                            className={
                              followUpPast ? "font-medium text-danger" : ""
                            }
                          >
                            Follow-up: {formatDate(l.follow_up_date)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 border-t border-border pt-3">
                    <LeadActions
                      view={{ id: l.id, status: l.status, contactUrl }}
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
