"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { slugify } from "@/lib/landing-html";
import { publishLandingPage } from "./landing-actions";

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-4 text-[15px] font-medium disabled:opacity-50";
const btnPrimary = `${btnBase} bg-primary text-white hover:bg-primary/90`;
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;
const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

/**
 * "Publish as Hosted Page" for a generated Geo Landing Page. Opens a slug popup
 * (auto-suggested from the target area), publishes via the server action, and
 * shows the public URL. Publishing costs 1 credit (handled server-side).
 */
export function PublishHostedPage({
  content,
  schema,
  suggestedArea,
  onPublished,
}: {
  content: string;
  schema: string | null;
  suggestedArea: string;
  onPublished?: (creditsLeft: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [pending, startPublish] = useTransition();
  const [publishedPath, setPublishedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fullUrl =
    publishedPath && typeof window !== "undefined"
      ? `${window.location.origin}${publishedPath}`
      : null;

  function openModal() {
    setSlug(slugify(suggestedArea));
    setError(null);
    setPublishedPath(null);
    setOpen(true);
  }

  function confirm() {
    setError(null);
    startPublish(async () => {
      const res = await publishLandingPage({
        content,
        schema,
        targetArea: suggestedArea,
        slug,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setPublishedPath(res.path ?? null);
      if (typeof res.creditsLeft === "number") onPublished?.(res.creditsLeft);
      toast("Page published ✓");
    });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => toast("URL copied ✓"),
      () => toast("Could not copy."),
    );
  }

  return (
    <>
      <button type="button" className={btnOutline} onClick={openModal}>
        🌐 Publish as Hosted Page
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Publish as hosted page"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-card bg-white p-5 sm:rounded-card"
            onClick={(e) => e.stopPropagation()}
          >
            {publishedPath ? (
              <div>
                <h3 className="text-[17px] font-semibold text-text-primary">
                  Your page is live 🎉
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Anyone can open this URL — no login needed.
                </p>
                <div className="mt-3 break-all rounded-button border border-border bg-subtle p-3 font-mono text-xs text-text-primary">
                  {fullUrl ?? publishedPath}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnOutline}
                    onClick={() => copy(fullUrl ?? publishedPath)}
                  >
                    Copy URL
                  </button>
                  <a
                    className={btnOutline}
                    href={publishedPath}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open ↗
                  </a>
                  <button
                    type="button"
                    className={btnPrimary}
                    onClick={() => setOpen(false)}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-[17px] font-semibold text-text-primary">
                  Publish as Hosted Page
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  Wraps this page into a hosted, mobile-ready website. Uses{" "}
                  <span className="font-medium text-text-primary">1 credit</span>.
                </p>

                <label className="mb-1.5 mt-4 block text-sm font-medium text-text-primary">
                  Page URL slug
                </label>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-text-secondary">/p/…/</span>
                  <input
                    type="text"
                    value={slug}
                    onChange={(e) => setSlug(slugify(e.target.value))}
                    placeholder="dentist-in-koramangala"
                    className={inputClass}
                  />
                </div>
                <p className="mt-1.5 text-xs text-text-secondary">
                  Lowercase letters, numbers and hyphens. We&apos;ll adjust it if
                  the URL is already taken.
                </p>

                {error ? (
                  <p className="mt-3 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
                    {error}
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={btnOutline}
                    disabled={pending}
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={pending || !slug}
                    onClick={confirm}
                  >
                    {pending ? "Publishing…" : "Publish"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
