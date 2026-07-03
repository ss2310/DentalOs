"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { formatDate } from "@/lib/format";
import { EmptyState } from "@/components/page";
import { unpublishLandingPage, deleteLandingPage } from "./landing-actions";

export type LandingPageRow = {
  id: string;
  slug: string;
  target_area: string | null;
  title: string | null;
  status: string;
  published_at: string | null;
  html_content: string | null;
};

const btnBase =
  "flex h-11 items-center justify-center rounded-button px-3.5 text-sm font-medium disabled:opacity-50";
const btnOutline = `${btnBase} border border-border text-text-primary hover:bg-subtle`;
const btnDanger = `${btnBase} border border-danger/30 text-danger hover:bg-danger/5`;

export function LandingPagesManager({
  pages,
  bookingSlug,
}: {
  pages: LandingPageRow[];
  bookingSlug: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicUrl = (slug: string) =>
    bookingSlug ? `${origin}/p/${bookingSlug}/${slug}` : null;

  function run(
    fn: () => Promise<{ ok?: boolean; error?: string }>,
    msg: string,
  ) {
    startTransition(async () => {
      const res = await fn();
      if (res?.error) {
        toast(res.error);
        return;
      }
      toast(msg);
      router.refresh();
    });
  }

  function copyUrl(slug: string) {
    const url = publicUrl(slug);
    if (!url) return;
    navigator.clipboard.writeText(url).then(
      () => toast("URL copied ✓"),
      () => toast("Could not copy."),
    );
  }

  // Download the stored HTML so a clinic (or the agency) can host it elsewhere.
  function downloadHtml(page: LandingPageRow) {
    if (!page.html_content) {
      toast("No HTML stored for this page.");
      return;
    }
    const blob = new Blob([page.html_content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${page.slug || "landing-page"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (pages.length === 0) {
    return (
      <EmptyState>
        No hosted pages yet. Generate a{" "}
        <span className="font-medium">Geo Landing Page</span> in Content Studio,
        then click <span className="font-medium">Publish as Hosted Page</span>.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        Hosted landing pages live at{" "}
        <code className="rounded bg-subtle px-1.5 py-0.5 text-[13px]">
          {origin}/p/{bookingSlug ?? "…"}/&lt;slug&gt;
        </code>
        . Download the HTML to host any page on your own domain.
      </p>

      {pages.map((p) => {
        const published = p.status === "published";
        const url = publicUrl(p.slug);
        return (
          <div key={p.id} className="rounded-card border border-border bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-text-primary">
                    {p.title || p.slug}
                  </span>
                  <span
                    className={`rounded-pill px-2.5 py-1 text-xs font-medium ${
                      published
                        ? "bg-success/10 text-success"
                        : "bg-subtle text-text-secondary"
                    }`}
                  >
                    {published ? "Published" : "Unpublished"}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-text-secondary">
                  {p.target_area ? `${p.target_area} · ` : ""}
                  <span className="font-mono text-[13px]">/{p.slug}</span>
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {published && p.published_at
                    ? `Published ${formatDate(p.published_at)}`
                    : "Draft"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                type="button"
                className={btnOutline}
                disabled={!url}
                onClick={() => copyUrl(p.slug)}
              >
                Copy URL
              </button>
              {url ? (
                <a
                  className={btnOutline}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open ↗
                </a>
              ) : null}
              <button
                type="button"
                className={btnOutline}
                onClick={() => downloadHtml(p)}
              >
                Download HTML
              </button>
              {published ? (
                <button
                  type="button"
                  className={btnOutline}
                  disabled={pending}
                  onClick={() =>
                    run(() => unpublishLandingPage(p.id), "Unpublished")
                  }
                >
                  Unpublish
                </button>
              ) : null}
              <button
                type="button"
                className={btnDanger}
                disabled={pending}
                onClick={() => {
                  if (window.confirm("Delete this hosted page permanently?")) {
                    run(() => deleteLandingPage(p.id), "Deleted");
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
