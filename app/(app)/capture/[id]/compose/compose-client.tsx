"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import {
  generateMomentCaptions,
  createMomentPost,
} from "../../compose-actions";

type Moment = {
  id: string;
  treatment: string | null;
  hasBefore: boolean;
  afterUrl: string | null;
  beforeUrl: string | null;
};

// Compose (free) → captions (1 credit) → queue. Three steps, phone-first.
export function ComposeClient({ moment }: { moment: Moment }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [template, setTemplate] = useState<"before_after" | "result_hero">(
    moment.hasBefore ? "before_after" : "result_hero",
  );
  const [formats, setFormats] = useState<string[]>(["feed"]);
  const [composing, setComposing] = useState(false);
  const [paths, setPaths] = useState<string[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [options, setOptions] = useState<string[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);

  const chip = (label: string, active: boolean, onClick: () => void, disabled = false) => (
    <button
      key={label}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[44px] items-center rounded-pill border px-4 text-sm transition-colors disabled:opacity-40 ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-white hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );

  const compose = async () => {
    setComposing(true);
    try {
      const res = await fetch("/api/capture/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ momentId: moment.id, template, formats }),
      });
      const data = await res.json();
      if (!res.ok) return toast(data.error ?? "Compose failed.");
      setPaths(data.paths ?? []);
      setUrls(data.urls ?? []);
      toast("Composed ✓ (free)");
    } finally {
      setComposing(false);
    }
  };

  const writeCaptions = () =>
    startTransition(async () => {
      const res = await generateMomentCaptions(moment.id);
      if (res.error) return toast(res.error);
      setOptions(res.options ?? []);
      setChosen(res.options?.[0] ?? null);
    });

  const queue = () =>
    startTransition(async () => {
      if (!chosen) return toast("Pick a caption first.");
      const res = await createMomentPost({
        momentId: moment.id,
        caption: chosen,
        renderPaths: paths,
      });
      if (res.error) return toast(res.error);
      toast("In the approval queue ✓");
      router.push(`/social/review/${res.postId}`);
    });

  return (
    <div className="mt-6 space-y-7">
      {/* raw photos */}
      <div className="flex gap-3">
        {moment.beforeUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={moment.beforeUrl} alt="Before" className="h-32 w-32 rounded-card border border-border object-cover" />
        ) : null}
        {moment.afterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={moment.afterUrl} alt="After" className="h-32 w-32 rounded-card border border-border object-cover" />
        ) : null}
        <p className="self-center text-sm text-text-secondary">
          {moment.treatment ?? "Captured moment"}
          <br />
          Photos are used exactly as shot — no edits, no AI.
        </p>
      </div>

      {/* 1 · template + sizes */}
      <div>
        <p className="text-[17px] font-semibold">1 · Layout & sizes</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {chip("Before / After", template === "before_after", () => setTemplate("before_after"), !moment.hasBefore)}
          {chip("Result hero", template === "result_hero", () => setTemplate("result_hero"))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {chip("Feed 1080×1080", formats.includes("feed"), () =>
            setFormats((f) => (f.includes("feed") ? f.filter((x) => x !== "feed") : [...f, "feed"])),
          )}
          {chip("Story 1080×1920", formats.includes("story"), () =>
            setFormats((f) => (f.includes("story") ? f.filter((x) => x !== "story") : [...f, "story"])),
          )}
        </div>
        <button
          onClick={compose}
          disabled={composing || formats.length === 0}
          className="mt-3 flex h-12 w-full items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
        >
          {composing ? "Composing…" : urls.length > 0 ? "Re-compose (free)" : "Compose (free)"}
        </button>
        {urls.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={u} src={u} alt={`Composed ${i + 1}`} className="h-44 shrink-0 rounded-card border border-border object-contain" />
            ))}
          </div>
        ) : null}
      </div>

      {/* 2 · captions */}
      <div>
        <p className="text-[17px] font-semibold">2 · Caption</p>
        {options === null ? (
          <button
            onClick={writeCaptions}
            disabled={pending || urls.length === 0}
            className="mt-3 flex h-12 w-full items-center justify-center rounded-button border border-border bg-white text-[15px] font-medium disabled:opacity-50"
          >
            {pending ? "Writing…" : "Write 3 caption options (1 credit)"}
          </button>
        ) : (
          <div className="mt-3 space-y-2">
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setChosen(o)}
                className={`w-full whitespace-pre-wrap rounded-card border p-4 text-left text-[15px] transition-colors ${
                  chosen === o ? "border-primary bg-primary/5" : "border-border bg-white"
                }`}
              >
                {o}
              </button>
            ))}
            <button
              onClick={writeCaptions}
              disabled={pending}
              className="min-h-[44px] text-sm text-text-secondary underline"
            >
              Write 3 more (1 credit)
            </button>
          </div>
        )}
      </div>

      {/* 3 · queue */}
      <button
        onClick={queue}
        disabled={pending || !chosen || paths.length === 0}
        className="flex h-12 w-full items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Queuing…" : "Send to approval queue"}
      </button>
      <p className="text-center text-xs text-text-secondary">
        Same queue as every post — approve it, then post manually from the app.
      </p>
    </div>
  );
}
