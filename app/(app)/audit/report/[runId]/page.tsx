import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveForVertical } from "@/lib/vertical.mjs";
import { visibilityScore, deadZonePct, isGapEligible } from "@/lib/audit/scoring.mjs";
import { PageHeader, SectionHeader } from "@/components/page";
import { formatDate } from "@/lib/format";
import { PlanItemRow, type PlanItemView } from "../../plan-item-row";
import { ShareButton } from "../../share-button";
import { WaSendButton } from "../../wa-send-button";

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
type MetricDefRow = {
  metric_key: string;
  display_name: string | null;
  source: string | null;
  value_type: string | null;
  vertical: string | null;
};

const ENGINES = [
  { key: "gemini_mentioned", label: "Gemini" },
  { key: "perplexity_cited", label: "Perplexity" },
  { key: "chatgpt_mentioned", label: "ChatGPT" },
  { key: "aio_cited", label: "Google AI" },
];

// Curated display order for the fixed-source metric groups (GBP + PageSpeed keys
// are a fixed set; website_llm keys are discovered from the metric catalog).
const GBP_KEYS = [
  "avg_google_rating",
  "total_google_reviews",
  "photo_count",
  "category_count",
  "business_hours_complete",
  "review_velocity_computed",
  "primary_gbp_category",
];
const PAGESPEED_KEYS = ["pagespeed_mobile", "core_web_vitals_pass", "https_ssl"];

function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\bgbp\b/gi, "GBP")
    .replace(/\bai\b/gi, "AI")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function AuditReportPage({
  params,
}: {
  params: { runId: string };
}) {
  const supabase = createClient();
  const runId = params.runId;

  const { data: run } = await supabase
    .from("audit_runs")
    .select("id, status, created_at, completed_at, error, digest_wa_message")
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
      .select("metric_key, display_name, source, value_type, vertical")
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
  const topRival = competitors[0] ?? null;
  const topRivalName = topRival?.display_name ?? null;

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
  const defs = (defsRes.data ?? []) as MetricDefRow[];
  const clinic = clinicRes.data as {
    business_name: string | null;
    area: string | null;
    city: string | null;
    vertical: string | null;
    market_monthly_search_volume: number | null;
    market_avg_patient_value_inr: number | null;
    market_ltv_multiplier: number | null;
  } | null;

  // metric_key → definition (label / value_type / source), for the full-picture
  // labels + formatting.
  const metaByKey = new Map(defs.map((d) => [d.metric_key, d]));
  const label = (key: string) => metaByKey.get(key)?.display_name ?? humanize(key);

  // measured N of M: distinct self metric_keys with a non-null value / active
  // metric universe (vertical-resolved).
  const selfSignals = signals.filter((s) => s.entity_id === self.id);
  const measuredKeys = new Set(
    selfSignals
      .filter((s) => s.value_number != null || s.value_bool != null || s.value_text != null)
      .map((s) => s.metric_key),
  );
  const metricUniverse = resolveForVertical(
    defs,
    clinic?.vertical ?? "dental",
    (r: { metric_key: string }) => r.metric_key,
  ) as MetricDefRow[];

  // signal lookup + value formatter for the full-picture comparison rows.
  const sigOf = (entityId: string, key: string) =>
    signals.find((s) => s.entity_id === entityId && s.metric_key === key) ?? null;
  const fmt = (key: string, s: SignalRow | null): string => {
    if (!s) return "—";
    if (s.value_bool != null) return s.value_bool ? "Yes" : "No";
    if (s.value_number != null) {
      const n = s.value_number;
      if (key === "avg_google_rating") return n.toFixed(1);
      if (key === "pagespeed_mobile") return `${Math.round(n)}/100`;
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    }
    if (s.value_text != null && s.value_text !== "") return s.value_text;
    return "—";
  };

  // Build the comparison rows for a fixed set of metric keys (self vs top rival),
  // skipping keys neither side measured.
  const compareRows = (keys: string[]) =>
    keys
      .map((key) => {
        const selfS = sigOf(self.id, key);
        const rivalS = topRival ? sigOf(topRival.id, key) : null;
        const has = (s: SignalRow | null) =>
          s != null &&
          (s.value_number != null || s.value_bool != null || s.value_text != null);
        if (!has(selfS) && !has(rivalS)) return null;
        return { key, label: label(key), you: fmt(key, selfS), rival: fmt(key, rivalS) };
      })
      .filter((r): r is { key: string; label: string; you: string; rival: string } => r != null);

  const websiteLlmKeys = metricUniverse
    .filter((d) => d.source === "website_llm")
    .map((d) => d.metric_key);

  const reputationRows = compareRows(GBP_KEYS);
  const websiteRows = compareRows([...PAGESPEED_KEYS, ...websiteLlmKeys]);

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
  const hasGrid = pins.total_pins != null && pins.total_pins > 0;

  const hasMarket =
    clinic?.market_monthly_search_volume != null ||
    clinic?.market_avg_patient_value_inr != null ||
    clinic?.market_ltv_multiplier != null;

  const scoreByEntityMoat = new Map(
    scores.map((s) => [`${s.entity_id}:${s.moat_key}`, s]),
  );
  const selfAvg = selfSummary?.average_digital_score ?? null;
  const quickFirst = items.some((i) => i.day_number <= 1 && i.effort === "15-min");
  const completedRuns = completedRes.count ?? 0;

  // 30-day plan → four weekly buckets.
  const weeks = [
    { title: "Week 1 — quick wins first", lo: 1, hi: 7 },
    { title: "Week 2", lo: 8, hi: 14 },
    { title: "Week 3", lo: 15, hi: 21 },
    { title: "Week 4", lo: 22, hi: 30 },
  ].map((w) => ({
    ...w,
    items: items.filter((i) => i.day_number >= w.lo && i.day_number <= w.hi),
  }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Your 30-Day Growth Plan"
        subtitle={`Deep audit · ${formatDate(run.completed_at ?? run.created_at)}`}
        action={
          items.length > 0 ? (
            <ShareButton
              taskCount={items.length}
              competitorName={topRivalName}
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

      {/* Recurring delta digest — one-tap WhatsApp of this month's "what moved". */}
      {run.digest_wa_message ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-success/30 bg-success/5 p-4">
          <p className="text-sm text-text-primary">
            Share this month&apos;s progress update.
          </p>
          <WaSendButton message={run.digest_wa_message} label="Send update" />
        </div>
      ) : null}

      {/* 2. WHERE YOU STAND — the full picture from every data source */}
      <SectionHeader hint={`measured on ${measuredKeys.size} of ${metricUniverse.length} signals`}>
        Where You Stand
      </SectionHeader>

      {/* 2a. score + map visibility strip */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-card bg-primary p-4 shadow-card">
          <p className="text-sm text-white/75">Digital score</p>
          <p className="mt-1 text-3xl font-semibold tracking-[-0.02em] text-white">
            {selfAvg != null ? selfAvg : "—"}
          </p>
          {selfSummary?.score_band ? (
            <p className="text-sm text-white/75">{selfSummary.score_band}</p>
          ) : null}
        </div>
        <MiniStat
          label="Map visibility"
          value={visibility != null ? `${visibility}%` : "—"}
          sub={visibility != null ? `dead zone ${deadZone}%` : undefined}
        />
        <MiniStat
          label="AI citation rate"
          value={
            citationRateSig?.value_number != null
              ? `${citationRateSig.value_number}%`
              : "—"
          }
          sub={topRivalName ? `vs top rival below` : undefined}
        />
      </div>

      {/* 2b. six moats — you vs top rival */}
      <div className="mt-4 rounded-card border border-border bg-white p-5 shadow-card">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
          The 6 growth moats{topRivalName ? ` · you vs ${topRivalName}` : ""}
        </p>
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
                <div className="relative h-2 w-full overflow-hidden rounded-pill bg-subtle">
                  {eligible ? (
                    <div
                      className="h-full rounded-pill bg-primary"
                      style={{ width: `${Math.min(100, selfRow?.score ?? 0)}%` }}
                    />
                  ) : null}
                  {eligible && bestRival != null ? (
                    <span
                      className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-ink/40"
                      style={{ left: `${Math.min(100, bestRival)}%` }}
                      title={`Top rival ${bestRival}`}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2c. reputation (Google profile) */}
      <CompareCard
        title="Reputation — your Google profile"
        rows={reputationRows}
        rivalName={topRivalName}
      />

      {/* 2d. website & performance */}
      <CompareCard
        title="Website & performance"
        rows={websiteRows}
        rivalName={topRivalName}
        emptyNote="No website analyzed — add your website in Settings so we can measure it."
      />

      {/* 2e. local map coverage (self only) */}
      {hasGrid ? (
        <div className="mt-4 rounded-card border border-border bg-white p-5 shadow-card">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
            Local map coverage
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <Pin label="Top 3" value={pins.green_pins} tone="success" />
            <Pin label="Rank 4–10" value={pins.yellow_pins} tone="warning" />
            <Pin label="Rank 10+" value={pins.red_pins} tone="danger" />
            <Pin label="Not found" value={pins.out_pins} tone="muted" />
            <span className="ml-auto self-center text-text-secondary">
              across {pins.total_pins} map points near you
            </span>
          </div>
        </div>
      ) : null}

      {/* 3. THE 30-DAY PLAN */}
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

      {weeks.map((w) => (
        <PlanGroup key={w.title} title={w.title} items={w.items} />
      ))}

      {/* 4. AI VISIBILITY */}
      <SectionHeader>AI Visibility</SectionHeader>
      <div className="rounded-card border border-border bg-white p-5 shadow-card">
        <p className="text-[15px] text-text-primary">
          {citationRateSig?.value_number != null
            ? `AI answer engines cited you ${citationRateSig.value_number}% of the time across our test questions.`
            : "We tested how often AI answer engines mention you."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {ENGINES.map((e) => {
            const val = selfSig(e.key)?.value_bool;
            const cited = val === true;
            const notMeasured = val == null;
            return (
              <span
                key={e.key}
                className={`rounded-pill px-3 py-1 text-xs font-medium ${
                  cited
                    ? "bg-success/10 text-success"
                    : notMeasured
                      ? "bg-subtle text-text-secondary/60"
                      : "bg-subtle text-text-secondary"
                }`}
              >
                {cited ? "✓" : notMeasured ? "•" : "—"} {e.label}
                {notMeasured ? " (not measured)" : ""}
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

      {/* 5. REVENUE — real card only when the formula lands; never a fake number */}
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

      {/* 7. HOW WE CALCULATED — methodology note */}
      <details className="mt-8 rounded-card border border-border bg-white shadow-card">
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-text-primary">
          How we calculated this
          <span className="ml-2 font-normal text-text-secondary">
            · measured on {measuredKeys.size} of {metricUniverse.length} signals
          </span>
        </summary>
        <div className="border-t border-border px-5 py-4">
          <p className="text-sm text-text-secondary">
            We score six growth &quot;moats&quot; from Google profile, website,
            map-rank and AI-visibility signals, and compare you with your top
            local rivals. The scores are our internal prioritization — moats we
            couldn&apos;t measure enough of are shown as &quot;not yet
            measured&quot; and never counted against you. The plan only ever
            targets moats we actually measured.
          </p>
        </div>
      </details>
    </div>
  );
}

function CompareCard({
  title,
  rows,
  rivalName,
  emptyNote,
}: {
  title: string;
  rows: { key: string; label: string; you: string; rival: string }[];
  rivalName: string | null;
  emptyNote?: string;
}) {
  return (
    <div className="mt-4 rounded-card border border-border bg-white p-5 shadow-card">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.06em] text-text-secondary">
        {title}
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-text-secondary">
          {emptyNote ?? "Nothing measured here yet."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="flex items-center bg-subtle px-3 py-2 text-xs font-medium text-text-secondary">
            <span className="flex-1">Metric</span>
            <span className="w-20 text-right">You</span>
            {rivalName ? (
              <span className="w-28 truncate text-right" title={rivalName}>
                {rivalName}
              </span>
            ) : null}
          </div>
          {rows.map((r, i) => (
            <div
              key={r.key}
              className={`flex items-center px-3 py-2.5 text-sm ${
                i > 0 ? "border-t border-border" : ""
              }`}
            >
              <span className="flex-1 text-text-primary">{r.label}</span>
              <span className="w-20 text-right font-medium text-text-primary">
                {r.you}
              </span>
              {rivalName ? (
                <span className="w-28 text-right text-text-secondary">{r.rival}</span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Pin({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "success" | "warning" | "danger" | "muted";
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-danger"
          : "bg-text-secondary/40";
  return (
    <span className="flex items-center gap-1.5 text-text-primary">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="font-medium">{value ?? 0}</span>
      <span className="text-text-secondary">{label}</span>
    </span>
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

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <p className="text-sm text-text-secondary">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-[-0.02em] text-text-primary">
        {value}
      </p>
      {sub ? <p className="text-xs text-text-secondary">{sub}</p> : null}
    </div>
  );
}
