import Link from "next/link";
import type { ReactNode } from "react";

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
