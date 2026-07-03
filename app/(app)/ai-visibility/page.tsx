import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/roles";
import { PageHeader, SectionHeader, EmptyState } from "@/components/page";
import {
  ENGINE_KEYS,
  computeScorecard,
  aggregateSources,
  trendByDate,
  statusOf,
  buildScorecardText,
  type AiQueryRow,
  type AiCheckRow,
} from "@/lib/ai-visibility";
import { ScoreCard } from "./score-card";
import { VisibilityMatrix, type MatrixRow } from "./visibility-matrix";
import { QueryManager } from "./query-manager";

export const dynamic = "force-dynamic";

export default async function AiVisibilityPage() {
  await requireAdmin();
  const supabase = createClient();

  const [queriesRes, checksRes, clinicRes] = await Promise.all([
    supabase
      .from("ai_visibility_queries")
      .select("id, query_text, query_layer, is_active, created_at")
      .order("query_layer", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("ai_visibility_checks")
      .select(
        "id, query_id, engine, checked_at, is_cited, is_mentioned, position_note, cited_sources, raw_excerpt",
      )
      .order("checked_at", { ascending: false }),
    supabase.from("clinics").select("business_name").single(),
  ]);

  const queries = (queriesRes.data as AiQueryRow[]) ?? [];
  const checks = (checksRes.data as AiCheckRow[]) ?? [];
  const clinicName = clinicRes.data?.business_name ?? "Your clinic";

  const active = queries.filter((q) => q.is_active);
  const scorecard = computeScorecard(active, checks);
  const sources = aggregateSources(checks);
  const trend = trendByDate(checks);
  const copyText = buildScorecardText({ clinicName, scorecard, sources });

  // Matrix: active queries × engines, latest status per cell + full history.
  const rows: MatrixRow[] = active.map((q) => ({
    id: q.id,
    query_text: q.query_text,
    query_layer: q.query_layer,
    cells: ENGINE_KEYS.map((engine) => {
      const history = checks
        .filter((c) => c.query_id === q.id && c.engine === engine)
        .sort((a, b) => b.checked_at.localeCompare(a.checked_at));
      return {
        engine,
        status: statusOf(history[0]),
        history: history.map((h) => ({
          checked_at: h.checked_at,
          status: statusOf(h),
          position_note: h.position_note,
          cited_sources: h.cited_sources,
          raw_excerpt: h.raw_excerpt,
        })),
      };
    }),
  }));

  return (
    <div>
      <PageHeader
        title="AI Visibility"
        subtitle="How often AI assistants cite your clinic when patients ask."
        action={
          active.length > 0 ? (
            <Link
              href="/ai-visibility/session"
              className="flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
            >
              Run Check Session
            </Link>
          ) : undefined
        }
      />

      <div className="mt-5">
        <ScoreCard scorecard={scorecard} copyText={copyText} />
      </div>

      {active.length > 0 ? (
        <>
          <SectionHeader hint="Tap a cell for history">
            Visibility Matrix
          </SectionHeader>
          <VisibilityMatrix rows={rows} />
        </>
      ) : null}

      <SectionHeader hint="Where AI sends patients instead">
        Citation Sources
      </SectionHeader>
      {sources.length === 0 ? (
        <EmptyState>
          No cited sources recorded yet. Add sources during a check session to see
          which sites AI engines quote for these queries — that&apos;s exactly
          where your clinic needs presence.
        </EmptyState>
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-white">
          {sources.slice(0, 12).map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"
            >
              <span className="min-w-0 truncate text-[15px] text-text-primary">
                {s.name}
              </span>
              <span className="shrink-0 rounded-pill bg-subtle px-2.5 py-0.5 text-xs font-medium text-text-secondary">
                {s.count} citation{s.count === 1 ? "" : "s"}
              </span>
            </div>
          ))}
        </div>
      )}

      {trend.length > 1 ? (
        <>
          <SectionHeader hint="Score per check session">Trend</SectionHeader>
          <div className="rounded-card border border-border bg-white p-5">
            <div className="flex items-end gap-2">
              {trend.map((t) => (
                <div
                  key={t.date}
                  className="flex flex-1 flex-col items-center justify-end gap-1"
                >
                  <div
                    className="w-full max-w-[40px] rounded-t bg-primary/70"
                    style={{ height: `${Math.max(4, t.pct)}px` }}
                    title={`${t.pct}% cited on ${t.date}`}
                  />
                  <span className="text-[10px] text-text-secondary">
                    {t.date.slice(5)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <SectionHeader>Tracked Queries</SectionHeader>
      <QueryManager queries={queries} />
    </div>
  );
}
