import Link from "next/link";

// Link-based tab bar (design system: quiet chrome, teal only on the active
// tab). Tab state lives in the URL (?tab=) so refresh/back keep the tab and
// server components can render only the active panel — no client state.
// Mobile-first: 44px targets, horizontal scroll when tabs overflow.

export type TabDef = { id: string; label: string; count?: number };

export function TabBar({
  tabs,
  active,
  hrefFor,
}: {
  tabs: TabDef[];
  active: string;
  hrefFor: (id: string) => string;
}) {
  return (
    <div
      role="tablist"
      className="scrollbar-none -mx-1 flex items-end gap-1 overflow-x-auto border-b border-border px-1"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            role="tab"
            aria-selected={isActive}
            href={hrefFor(t.id)}
            scroll={false}
            className={`-mb-px flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 text-sm font-medium ${
              isActive
                ? "border-primary text-text-primary"
                : "border-transparent text-text-secondary hover:text-text-primary"
            }`}
          >
            {t.label}
            {typeof t.count === "number" && t.count > 0 ? (
              <span
                className={`rounded-pill px-1.5 py-0.5 text-xs font-medium ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "bg-subtle text-text-secondary"
                }`}
              >
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
