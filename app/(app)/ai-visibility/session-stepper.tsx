"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "@/components/toast";
import { ENGINE_LABEL } from "@/lib/ai-visibility";
import { recordCheck } from "./actions";
import { saveProspectAiSummary } from "../prospect/actions";

export type Combo = {
  query_id: string;
  query_text: string;
  engine: string;
};

type Answer = { engine: string; is_cited: boolean; is_mentioned: boolean };

const answerBtn =
  "flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-button px-3 text-[15px] font-semibold transition-colors disabled:opacity-50";

export function SessionStepper({
  combos,
  mode,
  auditId,
  backHref,
  backLabel,
}: {
  combos: Combo[];
  mode: "clinic" | "prospect";
  auditId?: string;
  backHref: string;
  backLabel: string;
}) {
  const [i, setI] = useState(0);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<Answer[]>([]);

  // Optional per-check details.
  const [showDetails, setShowDetails] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState("");
  const [positionNote, setPositionNote] = useState("");
  const [excerpt, setExcerpt] = useState("");

  const total = combos.length;
  const current = combos[i];

  function resetFields() {
    setShowDetails(false);
    setSources([]);
    setSourceInput("");
    setPositionNote("");
    setExcerpt("");
  }

  function addSource() {
    const s = sourceInput.trim();
    if (!s) return;
    setSources((xs) => [...xs, s]);
    setSourceInput("");
  }

  function copyQuery() {
    navigator.clipboard?.writeText(current.query_text).then(
      () => toast("Query copied ✓"),
      () => toast("Couldn't copy — select it manually."),
    );
  }

  async function answer(kind: "cited" | "mentioned" | "absent") {
    if (!current || saving) return;
    const is_cited = kind === "cited";
    const is_mentioned = kind === "mentioned";
    setSaving(true);
    try {
      if (mode === "clinic") {
        const res = await recordCheck({
          query_id: current.query_id,
          engine: current.engine,
          is_cited,
          is_mentioned,
          cited_sources: sources,
          raw_excerpt: excerpt,
          position_note: positionNote,
        });
        if (res?.error) {
          toast(res.error);
          return;
        }
      }

      const answered: Answer = { engine: current.engine, is_cited, is_mentioned };
      const next = i + 1;
      resetFields();

      if (next >= total) {
        if (mode === "prospect") {
          const finalResults = [...results, answered];
          const res = await saveProspectAiSummary(auditId ?? "", finalResults);
          if (res?.error) {
            toast(res.error);
            return;
          }
        }
        setDone(true);
      } else {
        if (mode === "prospect") setResults((rs) => [...rs, answered]);
        setI(next);
      }
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg rounded-card border border-border bg-white p-8 text-center">
        <p className="text-2xl">✅</p>
        <h2 className="mt-2 font-display text-xl font-semibold text-text-primary">
          Session complete
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {total} checks recorded.
          {mode === "prospect"
            ? " The audit's AI visibility summary has been updated."
            : ""}
        </p>
        <Link
          href={backHref}
          className="mt-5 inline-flex h-11 items-center rounded-button bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary/90"
        >
          {backLabel}
        </Link>
      </div>
    );
  }

  const pctDone = total ? Math.round((i / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-xl">
      {/* Progress */}
      <div className="flex items-center justify-between text-sm text-text-secondary">
        <span>
          Check {i + 1} of {total}
        </span>
        <Link href={backHref} className="font-medium text-primary hover:underline">
          Exit
        </Link>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-pill bg-subtle">
        <div
          className="h-full rounded-pill bg-primary transition-all"
          style={{ width: `${pctDone}%` }}
        />
      </div>

      {/* Current combo */}
      <div className="mt-5 rounded-card border border-border bg-white p-5">
        <span className="inline-block rounded-pill bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          {ENGINE_LABEL[current.engine] ?? current.engine}
        </span>
        <div className="mt-3 flex items-start justify-between gap-3">
          <p className="text-lg font-medium text-text-primary">
            {current.query_text}
          </p>
          <button
            type="button"
            onClick={copyQuery}
            className="shrink-0 rounded-button border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-subtle"
          >
            Copy
          </button>
        </div>
        <p className="mt-2 text-sm text-text-secondary">
          Ask this in {ENGINE_LABEL[current.engine] ?? current.engine}, then mark
          the result.
        </p>

        {/* Three big buttons */}
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => answer("cited")}
            className={`${answerBtn} bg-success/10 text-success hover:bg-success/20`}
          >
            <span>Cited ✓</span>
            <span className="text-xs font-normal opacity-80">named + linked</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => answer("mentioned")}
            className={`${answerBtn} bg-warning/10 text-warning hover:bg-warning/20`}
          >
            <span>Mentioned ~</span>
            <span className="text-xs font-normal opacity-80">named, no link</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => answer("absent")}
            className={`${answerBtn} bg-danger/10 text-danger hover:bg-danger/20`}
          >
            <span>Absent ✗</span>
            <span className="text-xs font-normal opacity-80">not named</span>
          </button>
        </div>

        {/* Optional details */}
        <button
          type="button"
          onClick={() => setShowDetails((s) => !s)}
          className="mt-4 text-sm font-medium text-primary hover:underline"
        >
          {showDetails ? "Hide details" : "+ Add details (sources, excerpt, position)"}
        </button>

        {showDetails ? (
          <div className="mt-3 space-y-3 border-t border-border pt-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                Cited sources
              </label>
              <div className="flex gap-2">
                <input
                  className="h-11 w-full rounded-button border border-border px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={sourceInput}
                  onChange={(e) => setSourceInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSource();
                    }
                  }}
                  placeholder="Practo, JustDial, a URL…"
                />
                <button
                  type="button"
                  onClick={addSource}
                  className="h-11 shrink-0 rounded-button border border-border px-3 text-sm font-medium text-text-primary hover:bg-subtle"
                >
                  Add
                </button>
              </div>
              {sources.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {sources.map((s, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 rounded-pill bg-subtle px-2.5 py-1 text-xs text-text-primary"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          setSources((xs) => xs.filter((_, k) => k !== idx))
                        }
                        aria-label={`Remove ${s}`}
                        className="text-text-secondary hover:text-danger"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                Position note
              </label>
              <input
                className="h-11 w-full rounded-button border border-border px-3 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={positionNote}
                onChange={(e) => setPositionNote(e.target.value)}
                placeholder="e.g. 2nd of 5 clinics named"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-text-primary">
                Excerpt
              </label>
              <textarea
                rows={2}
                className="w-full rounded-button border border-border px-3 py-2 text-[15px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
                placeholder="Paste the sentence that named (or should have named) the clinic."
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
