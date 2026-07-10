"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { markPosted } from "../../actions";
import { PlatformBadge, PLATFORM_LABEL, PremiumChip, RenderChoices, type StyleId } from "../../ui";

type Post = {
  id: string;
  platform: string;
  format: string;
  caption: string;
  hashtags: string[];
  status: string;
  postedAt: string | null;
  premiumTier: string | null;
};

// Copy → download → share → mark as posted. Phone-first: big tap targets,
// native share sheet where available, wa.me-to-self as the fallback carrier.
export function PublishClient({
  post,
  renderUrls,
  waSelfNumber,
}: {
  post: Post;
  renderUrls: string[];
  waSelfNumber: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [urls, setUrls] = useState(renderUrls);
  const [premium, setPremium] = useState<string | null>(post.premiumTier);
  const [layout, setLayout] = useState<StyleId>("hero");

  const fullCaption =
    post.hashtags.length > 0
      ? `${post.caption}\n\n${post.hashtags.join(" ")}`
      : post.caption;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullCaption);
      setCopied(true);
      toast("Caption copied — paste it in the app.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast("Couldn't copy — long-press the text below to copy it.");
    }
  };

  const render = async (premiumId?: string) => {
    setRendering(true);
    try {
      const res = await fetch("/api/social/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          ...(premiumId ? { premium: premiumId } : {}),
          ...(!premiumId && post.format !== "carousel" ? { layout } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Render failed.");
      } else {
        setUrls(data.urls ?? []);
        setPremium(data.premium ?? null);
        if (typeof data.creditsLeft === "number")
          toast(`Done ✨ — ${data.creditsLeft} credits left.`);
      }
    } finally {
      setRendering(false);
    }
  };

  // One tap downloads every slide (browser fires sequential downloads).
  const downloadAll = async () => {
    for (let i = 0; i < urls.length; i++) {
      const a = document.createElement("a");
      a.href = urls[i];
      a.download = `post-${post.id.slice(0, 8)}-${i + 1}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      await new Promise((r) => setTimeout(r, 400));
    }
    toast(urls.length > 1 ? `Downloading ${urls.length} slides…` : "Downloading image…");
  };

  const share = async () => {
    // Native share sheet with the image(s) when supported…
    try {
      if (navigator.share) {
        let files: File[] = [];
        try {
          files = await Promise.all(
            urls.map(async (u, i) => {
              const blob = await (await fetch(u)).blob();
              return new File([blob], `post-${i + 1}.png`, { type: "image/png" });
            }),
          );
        } catch {
          files = [];
        }
        const payload: ShareData =
          files.length > 0 && navigator.canShare?.({ files })
            ? { files, text: fullCaption }
            : { text: fullCaption };
        await navigator.share(payload);
        return;
      }
    } catch {
      // fall through (user cancelled or share failed)
    }
    // …else wa.me-to-self: send the caption to your own WhatsApp so it's on
    // the phone you post from.
    if (waSelfNumber) {
      window.open(
        `https://wa.me/${waSelfNumber}?text=${encodeURIComponent(fullCaption)}`,
        "_blank",
        "noopener",
      );
    } else {
      toast("Sharing isn't available here — use Copy caption instead.");
    }
  };

  const done = () =>
    startTransition(async () => {
      const res = await markPosted(post.id);
      if (res.error) toast(res.error);
      else {
        toast("Marked as posted 🎉");
        router.push("/social");
        router.refresh();
      }
    });

  const needsImage = post.platform === "instagram";

  return (
    <div className="mt-6 space-y-5">
      <div className="flex items-center gap-2">
        <PlatformBadge platform={post.platform} />
        <span className="text-sm text-text-secondary">
          Post this on {PLATFORM_LABEL[post.platform] ?? post.platform}
        </span>
      </div>

      {/* Step 1 — caption */}
      <div className="rounded-card border border-border bg-white p-4 shadow-card">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          1 · Caption
        </p>
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{fullCaption}</p>
        <button
          onClick={copy}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white"
        >
          {copied ? "✓ Copied" : "Copy caption"}
        </button>
      </div>

      {/* Step 2 — image(s) */}
      <div className="rounded-card border border-border bg-white p-4 shadow-card">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
            2 · {post.format === "carousel" ? "Slides" : "Image"}
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
                  className="h-36 w-36 shrink-0 rounded-md border border-border object-cover"
                />
              ))}
            </div>
            <button
              onClick={downloadAll}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-button border border-border bg-white text-[15px] font-medium"
            >
              Download {urls.length > 1 ? `all ${urls.length} slides` : "image"}
            </button>
            <div className="mt-3">
              <p className="mb-2 text-xs text-text-secondary">
                {premium ? "Premium backdrop applied" : "Want a photo backdrop instead?"}
              </p>
              <RenderChoices
                format={post.format}
                rendering={rendering}
                onRender={render}
                compact
                layout={layout}
                onLayout={setLayout}
              />
            </div>
          </>
        ) : needsImage ? (
          <div className="mt-3">
            <RenderChoices
              format={post.format}
              rendering={rendering}
              onRender={render}
              compact={false}
              layout={layout}
              onLayout={setLayout}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-secondary">
            Text-only post — no image needed.
          </p>
        )}
      </div>

      {/* Step 3 — post + confirm */}
      <div className="rounded-card border border-border bg-white p-4 shadow-card">
        <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-secondary">
          3 · Post & confirm
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button
            onClick={share}
            className="flex h-12 items-center justify-center rounded-button border border-border bg-white text-[15px] font-medium"
          >
            Share to phone (or WhatsApp yourself)
          </button>
          {post.status === "posted_manually" ? (
            <p className="flex h-12 items-center justify-center text-[15px] font-medium text-success">
              ✓ Posted
            </p>
          ) : (
            <button
              onClick={done}
              disabled={pending}
              className="flex h-12 items-center justify-center rounded-button bg-primary text-[15px] font-semibold text-white disabled:opacity-60"
            >
              {pending ? "Saving…" : "Mark as posted"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
