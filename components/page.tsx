import type { ReactNode } from "react";

// Shared page-layout primitives so every module reads the same way:
//   PageHeader  →  StatGrid / StatCard  →  SectionHeader  →  list/table
// Colours come from the design tokens in CLAUDE.md (never raw hex here).

/** 24px semibold page title, optional subtitle, optional right-aligned action. */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-[15px] text-text-secondary">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

const STAT_TONE = {
  default: "text-text-primary",
  primary: "text-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
} as const;

export type StatTone = keyof typeof STAT_TONE;

/** Responsive row of stat cards. Defaults to 3 columns on desktop. */
export function StatGrid({
  cols = 3,
  children,
}: {
  cols?: 2 | 3 | 4;
  children: ReactNode;
}) {
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-3";
  return (
    <div className={`mt-5 grid grid-cols-1 gap-4 ${colClass}`}>{children}</div>
  );
}

/**
 * One summary metric. `tone` colour-codes the value by meaning. Set `hero` for
 * the single most important metric on a page — it fills with the brand colour
 * so the eye lands there first.
 */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  hero = false,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatTone;
  hero?: boolean;
}) {
  if (hero) {
    return (
      <div className="rounded-card bg-primary p-5 shadow-card">
        <p className="text-sm text-white/80">{label}</p>
        <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-white">
          {value}
        </p>
        {hint ? <p className="mt-0.5 text-sm text-white/70">{hint}</p> : null}
      </div>
    );
  }
  return (
    <div className="rounded-card border border-border bg-white p-5 shadow-card">
      <p className="text-sm text-text-secondary">{label}</p>
      <p
        className={`mt-1 font-display text-3xl font-semibold tracking-tight ${STAT_TONE[tone]}`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-sm text-text-secondary">{hint}</p> : null}
    </div>
  );
}

/**
 * 14px uppercase section label (design-system "section header"). Optional
 * right-aligned `hint` is where we surface the list's sort order so the
 * ordering reads as intentional rather than random.
 */
export function SectionHeader({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="mt-8 mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 className="text-sm font-medium uppercase tracking-wide text-text-secondary">
        {children}
      </h2>
      {hint ? (
        <span className="text-xs text-text-secondary">{hint}</span>
      ) : null}
    </div>
  );
}

/** Consistent empty-state card. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-white p-10 text-center">
      <p className="text-[15px] text-text-secondary">{children}</p>
    </div>
  );
}
