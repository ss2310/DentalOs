"use client";

import { useState, type ReactNode } from "react";

type TabKey = "requests" | "insights";

const TABS: { key: TabKey; label: string }[] = [
  { key: "requests", label: "Review Requests" },
  { key: "insights", label: "Insights" },
];

/**
 * Two-panel tabs for /reviews. Both panels are server-rendered and passed in as
 * nodes; this client wrapper only toggles which one is visible so the requests
 * list keeps its server data and the insights panel gets its own interactivity.
 */
export function ReviewsTabs({
  requests,
  insights,
  showInsights = true,
}: {
  requests: ReactNode;
  insights: ReactNode;
  showInsights?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("requests");

  // Receptionists don't get the business Insights report — just the request list.
  if (!showInsights) return <div>{requests}</div>;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Reviews sections"
        className="flex gap-1 border-b border-border"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex min-h-[44px] items-center border-b-2 px-4 text-[15px] font-medium transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">{tab === "requests" ? requests : insights}</div>
    </div>
  );
}
