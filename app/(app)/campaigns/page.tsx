import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { PageHeader, SectionHeader, EmptyState } from "@/components/page";
import { segmentLabel } from "./segments";
import { NewCampaign } from "./new-campaign";

export const dynamic = "force-dynamic";

type CampaignRow = {
  id: string;
  name: string;
  segment_type: string;
  status: "draft" | "active" | "done";
  sent_count: number;
  segment_filter: { patient_ids?: string[] } | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-black/5 text-text-secondary",
  active: "bg-primary/10 text-primary",
  done: "bg-success/10 text-success",
};

export default async function CampaignsPage() {
  const supabase = createClient();

  const [campaignRes, rateCardRes] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, segment_type, status, sent_count, segment_filter")
      .order("created_at", { ascending: false }),
    supabase
      .from("rate_cards")
      .select("id, treatment_name")
      .eq("is_active", true)
      .order("treatment_name", { ascending: true }),
  ]);

  const campaigns = (campaignRes.data as unknown as CampaignRow[]) ?? [];
  const rateCards =
    (rateCardRes.data as { id: string; treatment_name: string }[]) ?? [];
  const canUseAI = isAdminRole(await getUserRole());

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Reach a segment of patients on WhatsApp — one tap per patient, safe from bans."
        action={<NewCampaign rateCards={rateCards} canUseAI={canUseAI} />}
      />

      <SectionHeader hint="Newest first">Your Campaigns</SectionHeader>
      <div>
        {campaigns.length === 0 ? (
          <EmptyState>
            No campaigns yet. Create one to re-engage dormant patients, wish
            birthdays, or chase balances.
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => {
              const total = c.segment_filter?.patient_ids?.length ?? 0;
              return (
                <Link
                  key={c.id}
                  href={`/campaigns/${c.id}`}
                  className="flex flex-col gap-3 rounded-card border border-border bg-white p-4 hover:bg-subtle sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-medium text-text-primary">
                      {c.name}
                    </p>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {segmentLabel(c.segment_type)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-secondary">
                      <span className="font-medium text-text-primary">
                        {c.sent_count}
                      </span>
                      /{total} sent
                    </span>
                    <span
                      className={`rounded-pill px-2.5 py-1 text-xs font-medium capitalize ${
                        STATUS_BADGE[c.status] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
