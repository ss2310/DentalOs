"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { formatDate } from "@/lib/format";
import { platformBadge } from "@/lib/generate";
import { markPublished, deleteContent } from "./actions";

export type HistoryRow = {
  id: string;
  topic: string | null;
  tone_used: string | null;
  generated_copy: string;
  schema_markup: string | null;
  status: "draft" | "scheduled" | "published";
  published_date: string | null;
  created_at: string;
  post: { name: string; platform: string } | null;
};

const STATUS_BADGE: Record<HistoryRow["status"], { label: string; badge: string }> =
  {
    draft: { label: "Draft", badge: "bg-subtle text-text-secondary" },
    scheduled: { label: "Scheduled", badge: "bg-warning/10 text-warning" },
    published: { label: "Published", badge: "bg-success/10 text-success" },
  };

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;
const btnSuccess = `${btnBase} bg-success text-white hover:bg-success/90`;
const btnDanger = `${btnBase} border border-danger/30 text-danger hover:bg-danger/5`;
const filterInput =
  "h-11 rounded-button border border-border px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export function HistoryClient({ rows }: { rows: HistoryRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");

  const platforms = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.post?.platform).filter(Boolean)),
      ) as string[],
    [rows],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (platform !== "all" && r.post?.platform !== platform) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!q) return true;
      return (
        (r.topic ?? "").toLowerCase().includes(q) ||
        (r.post?.name ?? "").toLowerCase().includes(q) ||
        r.generated_copy.toLowerCase().includes(q)
      );
    });
  }, [rows, search, platform, status]);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast("Copied ✓"),
      () => toast("Could not copy."),
    );
  }

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>, msg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(msg);
      router.refresh();
    });
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search topic or text…"
          className={`${filterInput} flex-1`}
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className={filterInput}
        >
          <option value="all">All platforms</option>
          {platforms.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={filterInput}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
        </select>
      </div>

      <div className="mt-5 space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-card border border-border bg-white p-10 text-center">
            <p className="text-[15px] text-text-secondary">
              {rows.length === 0
                ? "No saved content yet. Generate your first piece →"
                : "No content matches your filters."}
            </p>
          </div>
        ) : (
          filtered.map((r) => {
            const badge = STATUS_BADGE[r.status];
            return (
              <div
                key={r.id}
                className="rounded-card border border-border bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-text-primary">
                        {r.post?.name ?? "Content"}
                      </span>
                      {r.post?.platform ? (
                        <span
                          className={`rounded-pill px-2.5 py-1 text-xs font-medium ${platformBadge(
                            r.post.platform,
                          )}`}
                        >
                          {r.post.platform}
                        </span>
                      ) : null}
                      <span
                        className={`rounded-pill px-2.5 py-1 text-xs font-medium ${badge.badge}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    {r.topic ? (
                      <p className="mt-1 truncate text-sm text-text-primary">
                        {r.topic}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-text-secondary">
                      {formatDate(r.created_at)}
                      {r.status === "published" && r.published_date
                        ? ` · Published ${formatDate(r.published_date)}`
                        : ""}
                    </p>
                  </div>
                </div>

                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium text-primary">
                    View content
                  </summary>
                  <div className="mt-2 whitespace-pre-wrap rounded-button border border-border bg-subtle p-3 text-sm leading-relaxed text-text-primary">
                    {r.generated_copy}
                  </div>
                  {r.schema_markup ? (
                    <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all rounded-button border border-border bg-subtle p-3 font-mono text-xs text-text-primary">
                      {r.schema_markup}
                    </pre>
                  ) : null}
                </details>

                <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => copy(r.generated_copy)}
                  >
                    Copy
                  </button>
                  {r.status !== "published" ? (
                    <button
                      type="button"
                      className={btnSuccess}
                      disabled={pending}
                      onClick={() =>
                        run(() => markPublished(r.id), "Marked published ✓")
                      }
                    >
                      Mark Published
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm("Delete this content permanently?")) {
                        run(() => deleteContent(r.id), "Deleted");
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
