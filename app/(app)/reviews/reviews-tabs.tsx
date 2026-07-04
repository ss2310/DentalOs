"use client";

import { useState, type ReactNode } from "react";

type TabKey = "requests" | "surveys" | "insights";

/**
 * Tabs for /reviews. Each panel is server-rendered and passed in as a node;
 * this client wrapper only toggles which one is visible so each panel keeps its
 * own server data. The Insights panel is admin-only (receptionists don't get
 * the business report), so it's added conditionally.
 */
export function ReviewsTabs({
  requests,
  surveys,
  insights,
  showInsights = true,
}: {
  requests: ReactNode;
  surveys: ReactNode;
  insights: ReactNode;
  showInsights?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("requests");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "requests", label: "Post-Visit" },
    { key: "surveys", label: "Survey Responses" },
    ...(showInsights
      ? [{ key: "insights" as TabKey, label: "Insights" }]
      : []),
  ];

  // Guard against a stale tab when Insights isn't available to this user.
  const active = tab === "insights" && !showInsights ? "requests" : tab;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Reviews sections"
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((t) => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={isActive}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex min-h-[44px] items-center border-b-2 px-4 text-[15px] font-medium transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-6">
        {active === "requests"
          ? requests
          : active === "surveys"
            ? surveys
            : insights}
      </div>
    </div>
  );
}
