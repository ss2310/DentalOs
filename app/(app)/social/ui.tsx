import Link from "next/link";
import type { ReactNode } from "react";
import { PREMIUM_TIERS, premiumTier, tierCost } from "@/lib/visuals/tiers";

// Tiny shared presentational helpers for the Social module (server-safe).

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  gbp: "Google Business",
};

const PLATFORM_TINT: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-700",
  facebook: "bg-blue-100 text-blue-700",
  gbp: "bg-primary/10 text-primary",
};

export function PlatformBadge({ platform }: { platform: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${PLATFORM_TINT[platform] ?? "bg-subtle text-text-secondary"}`}
    >
      {PLATFORM_LABEL[platform] ?? platform}
    </span>
  );
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Waiting for approval",
  approved: "Ready to post",
  posted_manually: "Posted",
  rejected: "Rejected",
};

const STATUS_TINT: Record<string, string> = {
  draft: "bg-subtle text-text-secondary",
  pending_approval: "bg-warning/10 text-warning",
  approved: "bg-primary/10 text-primary",
  posted_manually: "bg-success/10 text-success",
  rejected: "bg-danger/10 text-danger",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${STATUS_TINT[status] ?? "bg-subtle text-text-secondary"}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/** Chip shown on previews rendered with a premium AI backdrop. */
export function PremiumChip({ tier }: { tier: string | null | undefined }) {
  const t = premiumTier(tier);
  if (!t) return null;
  return (
    <span className="inline-flex items-center rounded-pill bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      ✨ {t.label}
    </span>
  );
}

// Free-render styles → the render.ts single-post layouts. This is what makes
// the brand colour actually show: "Clean" (hero) is the near-white card where
// the colour only tints the logo/footer; "Colour band" (band) puts a brand-
// colour header band on top; "Bold" (inverse) is a full brand-colour card.
// Carousels auto-compose their own colour mix, so the picker is single-only.
export type StyleId = "hero" | "band" | "inverse";
export const STYLE_OPTIONS: { id: StyleId; label: string }[] = [
  { id: "hero", label: "Clean" },
  { id: "band", label: "Colour band" },
  { id: "inverse", label: "Bold" },
];

/**
 * The render choice stack: an optional style picker (Clean / Colour band /
 * Bold — how much of the brand colour shows), the free branded render (the
 * default, first, primary), plus the premium backdrop tiers. Copy rule: the
 * free tier is "branded", never "basic" — it must not feel nerfed.
 */
export function RenderChoices({
  format,
  rendering,
  onRender,
  compact,
  layout,
  onLayout,
}: {
  format: string;
  rendering: boolean;
  onRender: (premium?: string) => void;
  compact?: boolean;
  /** Selected single-post style; enables the picker when paired with onLayout. */
  layout?: StyleId;
  onLayout?: (l: StyleId) => void;
}) {
  const showStyles = format !== "carousel" && !!onLayout;
  return (
    <div className="flex w-full flex-col gap-2">
      {showStyles ? (
        <div className="flex w-full rounded-button border border-border bg-white p-0.5">
          {STYLE_OPTIONS.map((s) => {
            const active = (layout ?? "hero") === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onLayout?.(s.id)}
                disabled={rendering}
                aria-pressed={active}
                className={`flex min-h-[40px] flex-1 items-center justify-center rounded-[8px] px-2 text-[13px] font-medium transition-colors disabled:opacity-60 ${
                  active ? "bg-primary text-white" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      ) : null}
      {!compact ? (
        <button
          onClick={() => onRender()}
          disabled={rendering}
          className="flex h-11 w-full items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white disabled:opacity-60"
        >
          {rendering ? "Rendering…" : "Render branded image (free)"}
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {PREMIUM_TIERS.map((t) => {
          const cost = tierCost(t, format);
          return (
            <button
              key={t.id}
              onClick={() => onRender(t.id)}
              disabled={rendering}
              className="flex min-h-[44px] flex-col items-center justify-center rounded-button border border-primary/30 bg-white px-3 py-1.5 text-[14px] font-medium text-text-primary disabled:opacity-60"
            >
              <span>✨ {t.label}</span>
              <span className="text-xs text-text-secondary">
                {cost} credit{cost === 1 ? "" : "s"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SocialPostRow = {
  id: string;
  platform: string;
  format: string;
  caption: string;
  status: string;
  topic: string | null;
  scheduled_date: string | null;
  ymyl_flags: unknown;
  posted_at: string | null;
  created_at: string;
};

/** One tappable row in the queue lists (44px+ target, mobile-first). */
export function PostRow({
  post,
  href,
  right,
}: {
  post: SocialPostRow;
  href: string;
  right?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[44px] items-center justify-between gap-3 rounded-card border border-border bg-white p-4 shadow-card transition-colors hover:border-primary/40"
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <PlatformBadge platform={post.platform} />
          {post.format === "carousel" ? (
            <span className="rounded-pill bg-subtle px-2.5 py-0.5 text-xs text-text-secondary">
              Carousel
            </span>
          ) : null}
          {post.ymyl_flags ? (
            <span className="rounded-pill bg-danger/10 px-2.5 py-0.5 text-xs font-medium text-danger">
              Needs fixing
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 truncate text-[15px] text-text-primary">
          {post.caption.split("\n")[0]}
        </p>
        {post.topic ? (
          <p className="mt-0.5 truncate text-xs text-text-secondary">{post.topic}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">{right}</div>
    </Link>
  );
}
