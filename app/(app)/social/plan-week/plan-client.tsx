"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";

// 3 questions → a 5-post week, one batch, straight into pending_approval.
// Each post is one generation call (1 credit each, 5 total). The batch shares
// a batchId so the queue shows it as one planning session.

type Spec = {
  topic: string;
  platforms: string[];
  format?: "single" | "carousel";
  gbpPostType?: "update" | "offer" | "event";
  context?: string;
  campaignType: string;
  scheduledDate: string;
};

function datePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function PlanWeekClient({
  focusIdeas,
  seasonalTopics,
}: {
  focusIdeas: string[];
  seasonalTopics: string[];
}) {
  const router = useRouter();
  const [focus, setFocus] = useState("");
  const [offer, setOffer] = useState("");
  const [event, setEvent] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={`flex min-h-[44px] items-center rounded-pill border px-4 text-sm transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "border-border bg-white hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );

  const buildWeek = (): Spec[] => {
    const seasonal = seasonalTopics[0] ?? focusIdeas[1] ?? focus;
    const specs: Spec[] = [
      // Mon-ish: the focus, hook-first on IG.
      { topic: focus, platforms: ["instagram"], campaignType: "Weekly focus", scheduledDate: datePlus(1) },
      // Tue: same focus, story-style on FB.
      { topic: focus, platforms: ["facebook"], campaignType: "Weekly focus", scheduledDate: datePlus(2) },
      // Wed: educational carousel deep-dive (event takes the slot when present).
      event
        ? { topic: event, platforms: ["instagram"], campaignType: "Event", context: event, scheduledDate: datePlus(3) }
        : { topic: `${focus} — step by step`, platforms: ["instagram"], format: "carousel" as const, campaignType: "Deep dive", scheduledDate: datePlus(3) },
      // Thu: Google Business — the offer when there is one.
      offer
        ? { topic: offer, platforms: ["gbp"], gbpPostType: "offer" as const, context: offer, campaignType: "Offer", scheduledDate: datePlus(4) }
        : { topic: focus, platforms: ["gbp"], gbpPostType: "update" as const, campaignType: "Weekly focus", scheduledDate: datePlus(4) },
      // Sat: seasonal/local moment.
      { topic: seasonal, platforms: ["instagram"], campaignType: "Seasonal", scheduledDate: datePlus(6) },
    ];
    return specs;
  };

  const run = async () => {
    if (!focus.trim()) {
      toast("Pick this week's focus first.");
      return;
    }
    const batchId = crypto.randomUUID();
    const specs = buildWeek();
    let made = 0;
    for (let i = 0; i < specs.length; i++) {
      setProgress(`Writing post ${i + 1} of ${specs.length}…`);
      const s = specs[i];
      const res = await fetch("/api/generate/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: s.topic,
          platforms: s.platforms,
          format: s.format ?? "single",
          gbpPostType: s.gbpPostType,
          context: s.context,
          campaignType: s.campaignType,
          scheduledDate: s.scheduledDate,
          batchId,
          submitForApproval: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setProgress(null);
        toast(data.error ?? "Generation failed.");
        if (data.upgrade) router.push("/upgrade");
        if (made > 0) {
          toast(`${made} post(s) were created before the stop — they're in your queue.`);
          router.push("/social");
        }
        return;
      }
      made += data.posts?.length ?? 0;
    }
    setProgress(null);
    toast(`Your week is ready — ${made} posts waiting for approval.`);
    router.push("/social");
    router.refresh();
  };

  return (
    <div className="mt-6 space-y-7">
      <div>
        <p className="text-[17px] font-semibold text-text-primary">
          1 · What should this week focus on?
        </p>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. Kids' dental checkups"
          className="mt-3 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {focusIdeas.map((s) => chip(s, focus === s, () => setFocus(s)))}
        </div>
      </div>

      <div>
        <p className="text-[17px] font-semibold text-text-primary">
          2 · Any offer running? <span className="text-sm font-normal text-text-secondary">(optional)</span>
        </p>
        <input
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          placeholder="e.g. Free consultation this week"
          className="mt-3 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
        />
      </div>

      <div>
        <p className="text-[17px] font-semibold text-text-primary">
          3 · Any event coming up? <span className="text-sm font-normal text-text-secondary">(optional)</span>
        </p>
        <input
          value={event}
          onChange={(e) => setEvent(e.target.value)}
          placeholder="e.g. Dental camp on Sunday at the clinic"
          className="mt-3 h-12 w-full rounded-button border border-border px-4 text-[15px] focus:outline-none"
        />
      </div>

      <button
        onClick={run}
        disabled={!!progress}
        className="flex h-12 w-full items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
      >
        {progress ?? "Create my week (5 posts · 5 credits)"}
      </button>
    </div>
  );
}
