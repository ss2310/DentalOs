import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { isLiveProvider } from "@/lib/serp";
import { getAuditBudget } from "@/lib/serp/budget";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";
import { PageHeader, SectionHeader, EmptyState } from "@/components/page";
import { SampleDataBanner } from "../rank/sample-banner";
import { NewAudit } from "./new-audit";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  business_name: string | null;
  area: string | null;
  avg_rank: string | null;
  created_at: string;
  share_token: string;
};

export default async function ProspectPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  // Agency-only. RLS would also block the data, but reject the whole page so
  // non-agency users never see the prospecting workspace.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_agency")
    .eq("id", user.id)
    .single();
  if (!profile?.is_agency) redirect("/dashboard");

  const [{ data: auditData }, budget] = await Promise.all([
    supabase
      .from("prospect_audits")
      .select("id, business_name, area, avg_rank, created_at, share_token")
      .eq("status", "complete")
      .order("created_at", { ascending: false }),
    getAuditBudget(supabase),
  ]);
  const audits = (auditData as AuditRow[]) ?? [];

  // Agency vertical picker is flag-gated (like the rest of the vertical UI). When
  // ON, offer the active verticals so a prospect can be audited natively.
  let verticals: { id: string; display_name: string }[] = [];
  if (multiVerticalEnabled()) {
    const { data: vData } = await supabase
      .from("verticals")
      .select("id, display_name")
      .eq("is_active", true)
      .order("id", { ascending: true });
    verticals = (vData as { id: string; display_name: string }[]) ?? [];
  }

  return (
    <div>
      <PageHeader
        title="Prospecting"
        subtitle="Audit a prospect clinic's Google Maps visibility and share a branded report."
        action={
          <NewAudit
            remaining={budget.remaining}
            cap={budget.cap}
            verticals={verticals}
          />
        }
      />
      <p className="mt-1 text-sm text-text-secondary">
        This month: {budget.used}/{budget.cap} audits used
      </p>

      {!isLiveProvider() ? <SampleDataBanner /> : null}

      <SectionHeader hint="Newest first">Past Audits</SectionHeader>

      {audits.length === 0 ? (
        <EmptyState>
          No audits yet. Click <span className="font-medium">+ New Audit</span> to
          scan a prospect&apos;s Map visibility.
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {audits.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-white p-4"
            >
              <Link href={`/prospect/${a.id}`} className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold text-text-primary">
                  {a.business_name ?? "Untitled audit"}
                </p>
                <p className="mt-0.5 truncate text-sm text-text-secondary">
                  {a.area ? `${a.area} · ` : ""}Avg rank{" "}
                  {a.avg_rank != null ? Number(a.avg_rank).toFixed(1) : "—"} ·{" "}
                  {formatDate(a.created_at)}
                </p>
              </Link>
              <a
                href={`/audit/${a.share_token}`}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-sm font-medium text-primary hover:underline"
              >
                Share link ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
