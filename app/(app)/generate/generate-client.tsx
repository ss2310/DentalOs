"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import {
  TONES,
  platformBadge,
  type PostType,
  type ExtraInput,
} from "@/lib/generate";
import { saveContent } from "./actions";
import { PublishHostedPage } from "./publish-hosted-page";

type Result = {
  content: string;
  schema: string | null;
  encoded: string | null;
  citable: boolean;
};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const areaClass =
  "w-full rounded-button border border-border px-3 py-2 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const btnBase =
  "flex h-11 items-center justify-center rounded-button px-4 text-[15px] font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;
const btnSuccess = `${btnBase} bg-success text-white hover:bg-success/90`;

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export function GenerateClient({
  postTypes,
  remaining,
  topicBanks,
}: {
  postTypes: PostType[];
  remaining: number;
  topicBanks: Record<string, string[]>;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState<string>(TONES[0]);
  const [context, setContext] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>({});
  // AI-Citable Mode — defaults ON, shown only for web-crawlable (Website) types.
  const [citable, setCitable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [savePending, startSave] = useTransition();
  // Client-tracked credits balance (updated from each generation's response).
  const [creditsLeft, setCreditsLeft] = useState(remaining);

  const selected = useMemo(
    () => postTypes.find((p) => p.id === selectedId) ?? null,
    [postTypes, selectedId],
  );

  const ef = selected?.extra_fields ?? null;
  const topicCfg = ef?.topic ?? {};
  const topicShown = topicCfg.show !== false;
  const topicRequired = topicShown && topicCfg.required !== false;
  const inputs: ExtraInput[] = ef?.inputs ?? [];

  // Curated topic suggestions for this type's bank (empty if none / not seeded).
  const topicSuggestions = useMemo(
    () => (selected?.topic_bank ? topicBanks[selected.topic_bank] ?? [] : []),
    [selected, topicBanks],
  );

  // Web-crawlable types (all platform "Website") get the AI-Citable toggle;
  // GBP / Instagram / Reel / WhatsApp / review types never see it.
  const isWebCrawlable = selected?.platform === "Website";

  const cost = selected?.credits_cost ?? 0;
  const canAfford = creditsLeft >= cost;

  const missingRequired =
    (topicRequired && !topic.trim()) ||
    inputs.some((i) => i.required && !(extras[i.name] ?? "").trim());

  function selectType(id: string) {
    setSelectedId(id);
    setTopic("");
    setExtras({});
    setCitable(true); // default ON for each new selection
    setResult(null);
    setError(null);
    setSaved(false);
  }

  async function generate() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postTypeId: selected.id,
          tone,
          topic,
          context,
          extras,
          citable: isWebCrawlable ? citable : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }
      setResult({
        content: data.content,
        schema: data.schema ?? null,
        encoded: data.encoded ?? null,
        citable: data.citable === true,
      });
      setCreditsLeft(
        typeof data.creditsLeft === "number"
          ? data.creditsLeft
          : creditsLeft - cost,
      );
      setSaved(false);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast(`${label} copied ✓`),
      () => toast("Could not copy."),
    );
  }

  function save() {
    if (!selected || !result) return;
    startSave(async () => {
      const res = await saveContent({
        postTypeId: selected.id,
        topic,
        toneUsed: tone,
        content: result.content,
        schema: result.schema,
        citable: result.citable,
      });
      if (res?.error) {
        toast(res.error);
        return;
      }
      setSaved(true);
      toast("Saved to history ✓");
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">
            Content Studio
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Generate ready-to-post marketing content with AI.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-text-secondary">
              Credits left
            </p>
            <p
              className="text-lg font-semibold"
              style={{ color: creditsLeft > 0 ? "#111827" : "#DC2626" }}
            >
              {creditsLeft}
            </p>
          </div>
          <Link
            href="/history"
            className="flex h-11 items-center rounded-button border border-border px-4 text-sm font-medium text-text-primary hover:bg-subtle"
          >
            History →
          </Link>
        </div>
      </div>

      {/* Post-type grid */}
      {postTypes.length === 0 ? (
        <div className="mt-6 rounded-card border border-border bg-white p-8 text-center">
          <p className="text-[15px] font-medium text-text-primary">
            No content types loaded yet.
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            Run{" "}
            <code className="rounded bg-subtle px-1.5 py-0.5 text-[13px]">
              supabase/migrations/005_seed_post_types.sql
            </code>{" "}
            in the Supabase SQL Editor to load the 10 templates.
          </p>
        </div>
      ) : (
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {postTypes.map((p) => {
          const active = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => selectType(p.id)}
              className={`flex min-h-[44px] flex-col items-start gap-2 rounded-card border p-4 text-left transition-colors ${
                active
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-border hover:bg-subtle"
              }`}
            >
              <span className="text-[15px] font-semibold text-text-primary">
                {p.name}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-pill px-2.5 py-1 text-xs font-medium ${platformBadge(
                    p.platform,
                  )}`}
                >
                  {p.platform}
                </span>
                <span className="text-xs text-text-secondary">
                  {p.credits_cost} credit{p.credits_cost === 1 ? "" : "s"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      )}

      {/* Input panel */}
      {selected ? (
        <div className="mt-6 rounded-card border border-border bg-white p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            {selected.name}
          </h2>

          <div className="mt-4 space-y-4">
            {topicShown ? (
              <div>
                <label className={labelClass}>
                  {topicCfg.label ?? "Topic"}
                  {topicRequired ? (
                    <span className="text-danger"> *</span>
                  ) : (
                    <span className="text-text-secondary"> (optional)</span>
                  )}
                </label>
                {/* Curated suggestions (if any) fill the field; free-text stays. */}
                {topicSuggestions.length > 0 ? (
                  <select
                    aria-label="Pick a suggested topic"
                    className={`${inputClass} mb-2`}
                    value={topicSuggestions.includes(topic) ? topic : ""}
                    onChange={(e) => {
                      if (e.target.value) setTopic(e.target.value);
                    }}
                  >
                    <option value="">💡 Pick a suggested topic…</option>
                    {topicSuggestions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={
                    topicSuggestions.length > 0
                      ? "…or write your own"
                      : topicCfg.placeholder ?? ""
                  }
                  className={inputClass}
                />
              </div>
            ) : null}

            {inputs.map((i) => (
              <div key={i.name}>
                <label className={labelClass}>
                  {i.label}
                  {i.required ? <span className="text-danger"> *</span> : null}
                </label>
                {i.type === "select" ? (
                  <select
                    value={extras[i.name] ?? ""}
                    onChange={(e) =>
                      setExtras((x) => ({ ...x, [i.name]: e.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {(i.options ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : i.type === "textarea" ? (
                  <textarea
                    rows={3}
                    value={extras[i.name] ?? ""}
                    onChange={(e) =>
                      setExtras((x) => ({ ...x, [i.name]: e.target.value }))
                    }
                    placeholder={i.placeholder ?? ""}
                    className={areaClass}
                  />
                ) : (
                  <input
                    type="text"
                    value={extras[i.name] ?? ""}
                    onChange={(e) =>
                      setExtras((x) => ({ ...x, [i.name]: e.target.value }))
                    }
                    placeholder={i.placeholder ?? ""}
                    className={inputClass}
                  />
                )}
              </div>
            ))}

            {isWebCrawlable ? (
              <div className="rounded-button border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-text-primary">
                      ✨ AI-Citable Mode
                    </p>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      Structures the page so ChatGPT, Gemini &amp; Perplexity can
                      quote it.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={citable}
                    aria-label="AI-Citable Mode"
                    onClick={() => setCitable((v) => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors ${
                      citable ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                        citable ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              </div>
            ) : null}

            <div>
              <label className={labelClass}>Tone</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className={inputClass}
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass}>
                Extra context{" "}
                <span className="text-text-secondary">(optional)</span>
              </label>
              <textarea
                rows={2}
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder="Anything specific to mention — an offer, a doctor's name, timings…"
                className={areaClass}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-text-secondary">
              This will use{" "}
              <span className="font-medium text-text-primary">
                {cost} credit{cost === 1 ? "" : "s"}
              </span>
              .
            </p>
            <button
              type="button"
              className={btnPrimary}
              disabled={loading || missingRequired || !canAfford}
              onClick={generate}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Spinner className="h-4 w-4" />
                  Generating…
                </span>
              ) : result ? (
                "Regenerate"
              ) : (
                "Generate"
              )}
            </button>
          </div>

          {!canAfford ? (
            <p className="mt-2 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              Not enough credits for this ({cost} needed, {creditsLeft} left
              this month).
            </p>
          ) : null}
          {error ? (
            <p className="mt-2 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>
      ) : postTypes.length > 0 ? (
        <p className="mt-6 text-sm text-text-secondary">
          Pick a content type above to get started.
        </p>
      ) : null}

      {/* Generating state */}
      {loading ? (
        <div className="mt-6 rounded-card border border-border bg-white p-6">
          <div className="flex items-center gap-3">
            <Spinner className="h-5 w-5 text-primary" />
            <p className="text-[15px] font-medium text-text-primary">
              Writing your {selected?.name ?? "content"}…
            </p>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            This usually takes a few seconds — please keep this page open.
          </p>
          <div className="mt-5 space-y-2.5" aria-hidden="true">
            <div className="h-3 w-3/4 animate-pulse rounded bg-subtle" />
            <div className="h-3 w-full animate-pulse rounded bg-subtle" />
            <div className="h-3 w-5/6 animate-pulse rounded bg-subtle" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-subtle" />
          </div>
        </div>
      ) : null}

      {/* Result */}
      {!loading && result ? (
        <div className="mt-6 rounded-card border border-border bg-white p-5">
          <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
            Result
          </h2>
          <div className="mt-3 whitespace-pre-wrap rounded-button border border-border bg-subtle p-4 text-[15px] leading-relaxed text-text-primary">
            {result.content}
          </div>

          {result.encoded ? (
            <div className="mt-3">
              <p className={labelClass}>wa.me-ready text (url-encoded)</p>
              <div className="max-h-24 overflow-auto break-all rounded-button border border-border bg-subtle p-3 font-mono text-xs text-text-secondary">
                {result.encoded}
              </div>
              <button
                type="button"
                className={`${btnOutline} mt-2`}
                onClick={() => copy(result.encoded!, "wa.me text")}
              >
                Copy wa.me text
              </button>
            </div>
          ) : null}

          {result.schema ? (
            <details className="mt-3 rounded-button border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-text-primary">
                SEO Schema (JSON-LD)
              </summary>
              <div className="border-t border-border p-4">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-button bg-subtle p-3 font-mono text-xs text-text-primary">
                  {result.schema}
                </pre>
                <button
                  type="button"
                  className={`${btnOutline} mt-2`}
                  onClick={() => copy(result.schema!, "Schema")}
                >
                  Copy Schema
                </button>
              </div>
            </details>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className={btnOutline}
              onClick={() => copy(result.content, "Content")}
            >
              Copy
            </button>
            <button
              type="button"
              className={btnOutline}
              disabled={loading}
              onClick={() => {
                if (window.confirm("Regenerate? This creates a new version.")) {
                  generate();
                }
              }}
            >
              Regenerate
            </button>
            <button
              type="button"
              className={btnSuccess}
              disabled={savePending || saved}
              onClick={save}
            >
              {saved ? "✓ Saved" : savePending ? "Saving…" : "Save"}
            </button>
            {/* Any web-crawlable (Website) page can be published as a hosted page. */}
            {selected?.platform === "Website" ? (
              <PublishHostedPage
                content={result.content}
                schema={result.schema}
                suggestedArea={extras["target_area"] || topic}
                onPublished={(left) => setCreditsLeft(left)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
