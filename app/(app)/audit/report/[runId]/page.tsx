import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveForVertical } from "@/lib/vertical.mjs";
import { visibilityScore, deadZonePct, isGapEligible } from "@/lib/audit/scoring.mjs";
import { PageHeader, SectionHeader } from "@/components/page";
import { formatDate } from "@/lib/format";
import { PlanItemRow, type PlanItemView } from "../../plan-item-row";
import { ShareButton } from "../../share-button";

export const dynamic = "force-dynamic";

type EntityRow = {
  id: string;
  entity_kind: "self" | "competitor";
  display_name: string | null;
};
type ScoreRow = {
  entity_id: string;
  moat_key: string;
  score: number;
  max_score: number;
  signals_measured: number;
  signals_total: number;
};
type SummaryRow = {
  entity_id: string;
  average_digital_score: number | null;
  score_band: string | null;
  synthesis: { headline?: string; competitor_story?: string[] } | null;
};
type SignalRow = {
  entity_id: string;
  metric_key: string;
  source: string;
  value_number: number | null;
  value_bool: boolean | null;
  value_text: string | null;
  raw_meta: { source_intelligence?: { domain: string; count: number }[] } | null;
};

const ENGINES = [
  { key: "gemini_mentioned", label: "Gemini" },
  { key: "perplexity_cited", label: "Perplexity" },
  { key: "chatgpt_mentioned", label: "ChatGPT" },
  { key: "aio_cited", label: "Google AI" },
];

export default async function AuditReportPage({
  params,
}: {
  params: { runId: string };
}) {
  const supabase = createClient();
  const runId = params.runId;

  const { data: run } = await supabase
    .from("audit_runs")
    .select("id, status, created_at, completed_at, error")
    .eq("id", runId)
    .maybeSingle();
  if (!run) notFound();

  if (run.status !== "complete") {
    return (
      <div>
        <PageHeader title="Deep Audit" />
        <div className="mt-6 rounded-card border border-border bg-white p-8 text-center shadow-card">
          <p className="text-[15px] text-text-primary">
            {run.status === "failed"
              ? "This audit didn't finish. You can run it again from the audit page — retries are free."
              : "This audit is still running. Come back in a moment."}
          </p>
          {run.error ? (
            <p className="mt-2 text-sm text-text-secondary">{run.error}</p>
          ) : null}
          <Link
            href="/audit"
            className="mt-5 inline-flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
          >
            Back to Deep Audit
          </Link>
        </div>
      </div>
    );
  }

  const [
    entitiesRes,
    planRes,
    summariesRes,
    scoresRes,
    cfgRes,
    signalsRes,
    clinicRes,
    defsRes,
    completedRes,
  ] = await Promise.all([
    supabase
      .from("audit_entities")
      .select("id, entity_kind, display_name")
      .eq("run_id", runId),
    supabase
      .from("audit_plans")
      .select(
        "id, title, summary, status, plan_items(id, day_number, title, description, evidence, competitor_context, effort, status)",
      )
      .eq("run_id", runId)
      .maybeSingle(),
    supabase
      .from("audit_summaries")
      .select("entity_id, average_digital_score, score_band, synthesis")
      .eq("run_id", runId),
    supabase
      .from("moat_scores")
      .select("entity_id, moat_key, score, max_score, signals_measured, signals_total")
      .eq("run_id", runId),
    supabase
      .from("moat_config")
      .select("moat_key, display_name, weight_pct")
      .eq("is_active", true)
      .order("weight_pct", { ascending: false }),
    supabase
      .from("audit_signals")
      .select("entity_id, metric_key, source, value_number, value_bool, value_text, raw_meta")
      .eq("run_id", runId),
    supabase
      .from("clinics")
      .select(
        "business_name, area, city, vertical, market_monthly_search_volume, market_avg_patient_value_inr, market_ltv_multiplier",
      )
      .single(),
    supabase
      .from("metric_definitions")
      .select("metric_key, vertical")
      .eq("is_active", true),
    supabase
      .from("audit_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "complete"),
  ]);

  const entities = (entitiesRes.data ?? []) as EntityRow[];
  const self = entities.find((e) => e.entity_kind === "self");
  const competitors = entities.filter((e) => e.entity_kind === "competitor");
  if (!self) notFound();
  const nameById = new Map(entities.map((e) => [e.id, e.display_name ?? "Competitor"]));

  const plan = planRes.data as
    | { id: string; summary: string | null; plan_items: PlanItemView[] }
    | null;
  const items = [...(plan?.plan_items ?? [])].sort((a, b) => a.day_number - b.day_number);
  const doneCount = items.filter((i) => i.status === "done").length;

  const summaries = (summariesRes.data ?? []) as SummaryRow[];
  const selfSummary = summaries.find((s) => s.entity_id === self.id);
  const synthesis = selfSummary?.synthesis ?? null;
  const headline = synthesis?.headline ?? plan?.summary ?? "";
  const competitorStory = Array.isArray(synthesis?.competitor_story)
    ? synthesis!.competitor_story!
    : [];

  const scores = (scoresRes.data ?? []) as ScoreRow[];
  const moatConfig = (cfgRes.data ?? []) as {
    moat_key: string;
    display_name: string;
    weight_pct: number;
  }[];
  const signals = (signalsRes.data ?? []) as SignalRow[];
  const clinic = clinicRes.data as {
    business_name: string | null;
    area: string | null;
    city: string | null;
    vertical: string | null;
    market_monthly_search_volume: number | null;
    market_avg_patient_value_inr: number | null;
    market_ltv_multiplier: number | null;
  } | null;

  // measured N of M: distinct self metric_keys with a non-null value / active
  // metric universe (vertical-resolved).
  const selfSignals = signals.filter((s) => s.entity_id === self.id);
  const measuredKeys = new Set(
    selfSignals
      .filter((s) => s.value_number != null || s.value_bool != null || s.value_text != null)
      .map((s) => s.metric_key),
  );
  const metricUniverse = resolveForVertical(
    (defsRes.data ?? []) as { metric_key: string; vertical: string | null }[],
    clinic?.vertical ?? "dental",
    (r: { metric_key: string }) => r.metric_key,
  ) as { metric_key: string }[];

  // AI panel
  const selfSig = (key: string) => selfSignals.find((s) => s.metric_key === key);
  const citationRateSig = selfSig("ai_citation_rate");
  const sourceIntel = citationRateSig?.raw_meta?.source_intelligence ?? [];
  const mentionByEntity = new Map(
    signals
      .filter((s) => s.metric_key === "ai_mentions_count")
      .map((s) => [s.entity_id, s.value_number ?? 0]),
  );

  // visibility (self grid)
  const gridVal = (key: string) => selfSig(key)?.value_number ?? null;
  const pins = {
    total_pins: gridVal("total_pins"),
    green_pins: gridVal("green_pins"),
    yellow_pins: gridVal("yellow_pins"),
    red_pins: gridVal("red_pins"),
    out_pins: gridVal("out_pins"),
  };
  const visibility = visibilityScore(pins);
  const deadZone = deadZonePct(pins);

  const hasMarket =
    clinic?.market_monthly_search_volume != null ||
    clinic?.market_avg_patient_value_inr != null ||
    clinic?.market_ltv_multiplier != null;

  const scoreByEntityMoat = new Map(
    scores.map((s) => [`${s.entity_id}:${s.moat_key}`, s]),
  );
  const selfAvg = selfSummary?.average_digital_score ?? null;
  const quickFirst = items.some((i) => i.day_number <= 1 && i.effort === "15-min");
  const topCompetitorName = competitors[0]?.display_name ?? null;
  const completedRuns = completedRes.count ?? 0;

  const week1 = items.filter((i) => i.day_number <= 5);
  const week2 = items.filter((i) => i.day_number >= 6 && i.day_number <= 10);
  const week3 = items.filter((i) => i.day_number >= 11);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Your 15-Day Growth Plan"
        subtitle={`Deep audit · ${formatDate(run.completed_at ?? run.created_at)}`}
        action={
          items.length > 0 ? (
            <ShareButton
              taskCount={items.length}
              competitorName={topCompetitorName}
              quickFirst={quickFirst}
            />
          ) : undefined
        }
      />

      {/* 1. HEADLINE + competitor story */}
      {headline ? (
        <div className="mt-6 rounded-card bg-primary p-6 shadow-card">
          <p className="text-[19px] font-semibold leading-snug tracking-[-0.01em] text-white">
            {headline}
          </p>
        </div>
      ) : null}
      {competitorStory.length > 0 ? (
        <div className="mt-4 rounded-card border border-border bg-white p-5 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
            What your competitors are doing
          </p>
          <ul className="mt-3 space-y-2.5">
            {competitorStory.map((obs, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] text-text-primary">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{obs}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 2. THE 15-DAY PLAN */}
      <SectionHeader hint={`${doneCount} of ${items.length} done`}>
        The Plan
      </SectionHeader>
      <div className="mb-4 h-2 w-full overflow-hidden rounded-pill bg-subtle">
        <div
          className="h-full rounded-pill bg-primary transition-all"
          style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
        />
      </div>
      <p className="mb-4 text-sm text-text-secondary">
        Tick each one off as you go. Next month&apos;s audit will measure whether
        these actions moved your numbers.
      </p>

      <PlanGroup title="Week 1 — quick wins first" items={week1} />
      <PlanGroup title="Week 2" items={week2} />
      <PlanGroup title="Days 11–15" items={week3} />

      {/* 3. AI VISIBILITY */}
      <SectionHeader>AI Visibility</SectionHeader>
      <div className="rounded-card border border-border bg-white p-5 shadow-card">
        <p className="text-[15px] text-text-primary">
          {citationRateSig?.value_number != null
            ? `AI answer engines cited you ${citationRateSig.value_number}% of the time across our test questions.`
            : "We tested how often AI answer engines mention you."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ENGINES.map((e) => {
            const cited = selfSig(e.key)?.value_bool === true;
            return (
              <span
                key={e.key}
                className={`rounded-pill px-3 py-1 text-xs font-medium ${
                  cited
                    ? "bg-success/10 text-success"
                    : "bg-subtle text-text-secondary"
                }`}
              >
                {cited ? "✓" : "—"} {e.label}
              </span>
            );
          })}
        </div>

        {competitors.length > 0 ? (
          <p className="mt-4 text-sm text-text-secondary">
            Mentions across all questions — you:{" "}
            <span className="font-medium text-text-primary">
              {mentionByEntity.get(self.id) ?? 0}
            </span>
            {competitors.map((c) => (
              <span key={c.id}>
                {" · "}
                {c.display_name}: {mentionByEntity.get(c.id) ?? 0}
              </span>
            ))}
          </p>
        ) : null}

        {sourceIntel.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
              Sources AI trusts in {clinic?.city ?? "your city"}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sourceIntel.slice(0, 10).map((d) => (
                <span
                  key={d.domain}
                  className="rounded-pill bg-subtle px-2.5 py-1 text-xs text-text-secondary"
                >
                  {d.domain} · {d.count}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* 4. REVENUE — real card only when the formula lands; never a fake number */}
      <SectionHeader>Revenue Impact</SectionHeader>
      <div className="rounded-card border border-border bg-white p-5 shadow-card">
        {hasMarket ? (
          <p className="text-[15px] text-text-secondary">
            Your market data is saved — detailed revenue-loss estimates are
            unlocking soon.
          </p>
        ) : (
          <p className="text-[15px] text-text-secondary">
            Add your market data in{" "}
            <Link href="/settings" className="font-medium text-primary hover:underline">
              Settings
            </Link>{" "}
            (monthly searches, average patient value) to unlock revenue-loss
            estimates.
          </p>
        )}
      </div>

      {/* 6. TREND (≥2 completed runs) */}
      {completedRuns >= 2 ? (
        <>
          <SectionHeader>Since Last Audit</SectionHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <MiniStat label="Plan completion" value={`${items.length ? Math.round((doneCount / items.length) * 100) : 0}%`} />
            <MiniStat label="Digital score" value={selfAvg != null ? String(selfAvg) : "—"} />
            <MiniStat
              label="Map visibility"
              value={visibility != null ? `${visibility}%` : "—"}
            />
          </div>
        </>
      ) : null}

      {/* 5. HOW WE CALCULATED — collapsed */}
      <details className="mt-8 rounded-card border border-border bg-white shadow-card">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-text-primary">
          How we calculated this
          <span className="ml-2 font-normal text-text-secondary">
            · measured on {measuredKeys.size} of {metricUniverse.length} signals
          </span>
        </summary>
        <div className="border-t border-border px-5 py-4">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm text-text-secondary">Your digital score</span>
            <span className="text-2xl font-semibold tracking-[-0.02em] text-primary">
              {selfAvg != null ? selfAvg : "—"}
            </span>
            {selfSummary?.score_band ? (
              <span className="text-sm text-text-secondary">
                ({selfSummary.score_band})
              </span>
            ) : null}
            {visibility != null ? (
              <span className="ml-auto text-sm text-text-secondary">
                Map visibility {visibility}% · dead zone {deadZone}%
              </span>
            ) : null}
          </div>
          <div className="space-y-3">
            {moatConfig.map((m) => {
              const selfRow = scoreByEntityMoat.get(`${self.id}:${m.moat_key}`);
              const eligible = selfRow ? isGapEligible(selfRow) : false;
              const bestRival = competitors
                .map((c) => scoreByEntityMoat.get(`${c.id}:${m.moat_key}`)?.score ?? null)
                .filter((v): v is number => v != null)
                .sort((a, b) => b - a)[0];
              return (
                <div key={m.moat_key}>
                  <div className="mb-1 flex items-baseline justify-between text-sm">
                    <span className="text-text-primary">{m.display_name}</span>
                    <span className="text-text-secondary">
                      {eligible ? (
                        <>
                          You {selfRow?.score ?? 0}
                          {bestRival != null ? ` · Top rival ${bestRival}` : ""}
                        </>
                      ) : (
                        "not yet measured"
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-pill bg-subtle">
                    {eligible ? (
                      <div
                        className="h-full rounded-pill bg-primary"
                        style={{ width: `${Math.min(100, selfRow?.score ?? 0)}%` }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs text-text-secondary">
            Scores are our internal prioritization. Moats we couldn&apos;t measure
            enough of are shown as &quot;not yet measured&quot; and never counted
            against you.
          </p>
        </div>
      </details>
    </div>
  );
}

function PlanGroup({ title, items }: { title: string; items: PlanItemView[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-5">
      <p className="mb-2 text-sm font-semibold text-text-primary">{title}</p>
      <div className="space-y-2">
        {items.map((it) => (
          <PlanItemRow key={it.id} item={it} />
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-text-primary">
        {value}
      </p>
    </div>
  );
}
