import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CompetitorTable } from "@/components/competitor-table";
import { Heatmap } from "@/components/heatmap";
import type { PublicAudit } from "@/lib/types";

export const dynamic = "force-dynamic";

// Closing call-to-action on the public report. Edit this one line to change the
// pitch shown to every prospect.
const AUDIT_CTA =
  "Want these red squares to turn green? We help local clinics climb the Google Map — reply and let's talk.";

const ENGINE_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google_ai_overview: "Google AI Overview",
};

export default async function PublicAuditPage({
  params,
}: {
  params: { token: string };
}) {
  const supabase = createClient();
  // Anon, token-scoped read via SECURITY DEFINER RPC. A guessed/blank token
  // simply returns no rows — nothing else is exposed.
  const { data } = await supabase.rpc("get_prospect_audit_by_token", {
    p_token: params.token,
  });
  const audit = (Array.isArray(data) ? data[0] : null) as PublicAudit | null;
  if (!audit) notFound();

  const gridSize = Math.round(Math.sqrt(audit.grid_points?.length ?? 0)) || 5;
  const summary = audit.competitors;
  const total = summary?.total_cells ?? audit.grid_points?.length ?? 0;
  const area = audit.area || "your area";
  const ai = audit.ai_visibility_summary;

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-white px-4 py-8 sm:px-6">
      {/* Branded to the prospect */}
      <p className="text-sm font-medium uppercase tracking-wide text-primary">
        Google Maps Visibility Report
      </p>
      <h1 className="mt-2 text-2xl font-semibold leading-snug text-text-primary sm:text-3xl">
        How visible is {audit.business_name} on Google Maps in {area}?
      </h1>

      {/* Metrics */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">Average Map Rank</p>
          <p className="mt-1 text-4xl font-semibold text-text-primary">
            {audit.avg_rank != null ? Number(audit.avg_rank).toFixed(1) : "—"}
          </p>
        </div>
        <div className="rounded-card border border-border bg-white p-5">
          <p className="text-sm text-text-secondary">In Top 3</p>
          <p className="mt-1 text-4xl font-semibold text-success">
            {audit.pct_in_top3 != null
              ? `${Math.round(Number(audit.pct_in_top3))}%`
              : "—"}
          </p>
        </div>
      </div>

      {/* The colored grid — red cells are the hook */}
      <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-text-secondary">
        Where you show up (and where you don&apos;t)
      </h2>
      <Heatmap points={audit.grid_points ?? []} gridSize={gridSize} />

      {/* Who's winning instead */}
      <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-text-secondary">
        Who&apos;s winning instead
      </h2>
      {summary ? (
        <CompetitorTable
          target={summary.target}
          rivals={summary.rivals}
          total={total}
          youLabel={audit.business_name ?? "You"}
        />
      ) : (
        <div className="rounded-card border border-border bg-white p-6 text-center text-[15px] text-text-secondary">
          No competitor data available.
        </div>
      )}

      {/* What's holding you back */}
      {audit.findings && audit.findings.length > 0 ? (
        <>
          <h2 className="mt-8 mb-3 text-sm font-medium uppercase tracking-wide text-text-secondary">
            What&apos;s holding you back
          </h2>
          <ul className="space-y-2">
            {audit.findings.map((flag, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-card border border-border bg-white px-4 py-3 text-[15px] text-text-primary"
              >
                <span className="mt-0.5 text-danger">•</span>
                {flag}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* AI search — only when populated (R4) */}
      {ai && ai.engines && ai.engines.length > 0 ? (
        <>
          <h2 className="mt-8 mb-1 text-sm font-medium uppercase tracking-wide text-text-secondary">
            And here&apos;s the bigger problem — AI search
          </h2>
          <p className="mb-3 text-sm text-text-secondary">
            When people ask AI assistants for a clinic in {area}, here&apos;s who
            gets named.
          </p>
          <div className="flex flex-wrap gap-2">
            {ai.engines.map((e) => {
              const cited = e.is_cited;
              const mentioned = e.is_mentioned;
              const tone = cited
                ? "border-success/30 bg-success/5 text-success"
                : mentioned
                  ? "border-warning/30 bg-warning/5 text-warning"
                  : "border-danger/30 bg-danger/5 text-danger";
              const status = cited
                ? "Cited"
                : mentioned
                  ? "Mentioned"
                  : "Not cited";
              return (
                <span
                  key={e.engine}
                  className={`rounded-pill border px-3 py-1 text-sm font-medium ${tone}`}
                >
                  {ENGINE_LABEL[e.engine] ?? e.engine}: {status}
                </span>
              );
            })}
          </div>
        </>
      ) : null}

      {/* Closing CTA */}
      <div className="mt-10 rounded-card border border-primary/30 bg-primary/5 p-6 text-center">
        <p className="text-[15px] font-medium text-text-primary">{AUDIT_CTA}</p>
      </div>

      <p className="mt-6 text-center text-xs text-text-secondary">
        Powered by GrowthOS
      </p>
    </main>
  );
}
