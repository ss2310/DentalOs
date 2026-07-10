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

/**
 * The render choice stack: the free branded render (the default, first,
 * primary), plus the premium AI-image tiers. Copy rule: the free tier is
 * "branded", never "basic" — it must not feel nerfed.
 */
export function RenderChoices({
  format,
  rendering,
  onRender,
  compact,
}: {
  format: string;
  rendering: boolean;
  onRender: (premium?: string) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex w-full flex-col gap-2">
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
              className="flex min-h-[56px] flex-col items-center justify-center rounded-button border border-primary/30 bg-white px-3 py-1.5 text-center text-[14px] font-medium text-text-primary disabled:opacity-60"
            >
              <span>✨ {t.label}</span>
              <span className="text-[11px] leading-tight text-text-secondary">{t.vendorLabel}</span>
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

/**
 * The one image control surface, shared by review + publish and shown for EVERY
 * platform (Instagram, Facebook, Google Business all support a post image).
 * Free branded card, or a clean AI photo from the post — with an optional
 * description to steer it. Upload-your-own lives here too (see UploadPhoto).
 */
export function ImageStudio({
  format,
  urls,
  rendering,
  premium,
  describe,
  onDescribe,
  overlay,
  onOverlay,
  onRender,
  actions,
  children,
}: {
  format: string;
  urls: string[];
  rendering: boolean;
  premium: string | null;
  describe: string;
  onDescribe: (v: string) => void;
  /** Greeting-poster: stamp the clinic name + headline over the AI photo. */
  overlay: boolean;
  onOverlay: (v: boolean) => void;
  onRender: (premium?: string) => void;
  /** Extra buttons under the thumbnails (e.g. Download on the publish screen). */
  actions?: ReactNode;
  /** Slot for the upload-your-own-photo panel. */
  children?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-border bg-white p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          Post image
        </p>
        <PremiumChip tier={premium} />
      </div>

      {urls.length > 0 ? (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {urls.map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={u}
                src={u}
                alt={`Image ${i + 1}`}
                className="h-32 w-32 shrink-0 rounded-md border border-border object-cover"
              />
            ))}
          </div>
          {actions ? <div className="mt-3">{actions}</div> : null}
        </>
      ) : (
        <p className="mt-2 text-sm text-text-secondary">
          No image yet — make a free branded card, generate an AI photo from your
          post, or upload your own.
        </p>
      )}

      <div className="mt-4">
        <label className="text-xs font-medium text-text-secondary">
          Describe the AI photo <span className="font-normal">(optional)</span>
        </label>
        <input
          value={describe}
          onChange={(e) => onDescribe(e.target.value)}
          maxLength={300}
          placeholder="e.g. a calm modern clinic reception, plants, warm morning light"
          className="mt-1 h-11 w-full rounded-button border border-border px-3 text-[15px] focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-secondary">
          Anything you like — a scene, a festive greeting, people. AI text can be
          rough; for a crisp name/message use the greeting poster below.
        </p>
      </div>

      {format !== "carousel" ? (
        <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={overlay}
            onChange={(e) => onOverlay(e.target.checked)}
            className="mt-1 h-4 w-4 accent-primary"
          />
          <span>
            Greeting poster — stamp my clinic name &amp; the caption&apos;s first
            line neatly over the AI photo.
          </span>
        </label>
      ) : null}

      <div className="mt-3">
        <RenderChoices format={format} rendering={rendering} onRender={onRender} />
      </div>

      {children}
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
