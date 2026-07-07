"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { PLATFORM_LABEL } from "../ui";

const PLATFORMS = ["instagram", "facebook", "gbp"] as const;

export function NewPostClient({
  suggestions,
  repurpose,
}: {
  suggestions: { social: string[]; seasonal: string[] };
  repurpose: { id: string; label: string }[];
}) {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [sourceContentId, setSourceContentId] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "facebook"]);
  const [carousel, setCarousel] = useState(false);
  const [gbpType, setGbpType] = useState("update");
  const [context, setContext] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (p: string) =>
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );

  const generate = async () => {
    if (!topic.trim()) {
      toast("Give the post a topic first.");
      return;
    }
    if (platforms.length === 0) {
      toast("Pick at least one platform.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/generate/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: topic.trim(),
          platforms,
          format: carousel ? "carousel" : "single",
          gbpPostType: gbpType,
          context: context.trim() || undefined,
          sourceContentId: sourceContentId || undefined,
          submitForApproval: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Generation failed.");
        if (data.upgrade) router.push("/upgrade");
        return;
      }
      toast(
        data.anyFlagged
          ? "Generated — one variant needs a quick fix before approval."
          : `${data.posts.length} post${data.posts.length > 1 ? "s" : ""} ready for approval.`,
      );
      router.push("/social");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`flex min-h-[44px] items-center rounded-pill border px-4 text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-white text-text-primary hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mt-6 space-y-6">
      <div>
        <label className="text-sm font-medium text-text-primary">Topic</label>
        <input
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value);
            setSourceContentId("");
          }}
          placeholder="e.g. Winter teeth sensitivity"
          className="mt-2 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
        />
        {suggestions.social.length > 0 ? (
          <>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-text-secondary">
              Ideas
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.social.slice(0, 5).map((s) =>
                chip(s, topic === s, () => setTopic(s)),
              )}
            </div>
          </>
        ) : null}
        {suggestions.seasonal.length > 0 ? (
          <>
            <p className="mt-3 text-xs font-medium uppercase tracking-[0.08em] text-text-secondary">
              Seasonal
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestions.seasonal.slice(0, 5).map((s) =>
                chip(s, topic === s, () => setTopic(s)),
              )}
            </div>
          </>
        ) : null}
      </div>

      {repurpose.length > 0 ? (
        <div>
          <label className="text-sm font-medium text-text-primary">
            Or repurpose something you already made
          </label>
          <select
            value={sourceContentId}
            onChange={(e) => {
              setSourceContentId(e.target.value);
              const item = repurpose.find((r) => r.id === e.target.value);
              if (item) setTopic(item.label.split(": ").slice(1).join(": ") || item.label);
            }}
            className="mt-2 h-12 w-full rounded-button border border-border bg-white px-3 text-[15px] focus:outline-none"
          >
            <option value="">— none —</option>
            {repurpose.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label className="text-sm font-medium text-text-primary">Platforms</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {PLATFORMS.map((p) =>
            chip(PLATFORM_LABEL[p], platforms.includes(p), () => toggle(p)),
          )}
        </div>
        {platforms.includes("instagram")
          ? chipRow(
              "Instagram style",
              <div className="mt-2 flex gap-2">
                {chip("Single image", !carousel, () => setCarousel(false))}
                {chip("6-slide carousel", carousel, () => setCarousel(true))}
              </div>,
            )
          : null}
        {platforms.includes("gbp")
          ? chipRow(
              "Google Business type",
              <div className="mt-2 flex gap-2">
                {(["update", "offer", "event"] as const).map((t) =>
                  chip(t[0].toUpperCase() + t.slice(1), gbpType === t, () => setGbpType(t)),
                )}
              </div>,
            )
          : null}
      </div>

      <div>
        <label className="text-sm font-medium text-text-primary">
          Extra details <span className="font-normal text-text-secondary">(optional — prices/offers only count if written here)</span>
        </label>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          rows={3}
          placeholder="e.g. Free checkup camp this Sunday, 10am–2pm"
          className="mt-2 w-full rounded-card border border-border p-4 text-[15px] focus:outline-none"
        />
      </div>

      <button
        onClick={generate}
        disabled={busy}
        className="flex h-12 w-full items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {busy
          ? "Writing your posts…"
          : `Generate (${platforms.length} credit${platforms.length === 1 ? "" : "s"})`}
      </button>
      <p className="text-center text-xs text-text-secondary">
        1 credit per post · images &amp; carousels are free
      </p>
    </div>
  );
}

function chipRow(label: string, children: React.ReactNode) {
  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-text-primary">{label}</p>
      {children}
    </div>
  );
}
