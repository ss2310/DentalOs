"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import {
  approvePost,
  rejectPost,
  submitForApproval,
  updatePostCaption,
} from "../../actions";
import { PlatformBadge, StatusBadge, ImageStudio } from "../../ui";
import { UploadPhoto } from "../../upload-photo";

type Slide = { title: string; body: string };
type Post = {
  id: string;
  platform: string;
  format: string;
  caption: string;
  hashtags: string[];
  slides: Slide[] | null;
  gbpPostType: string | null;
  softWarnings: string[];
  ymylFlags: string[] | null;
  status: string;
  scheduledDate: string | null;
  topic: string | null;
  premiumTier: string | null;
};

// Platform-true previews: IG card with the rendered image, FB text post, GBP
// card. Mobile-first — every button is ≥44px.
export function ReviewClient({
  post,
  clinicName,
  renderUrls,
}: {
  post: Post;
  clinicName: string;
  renderUrls: string[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [caption, setCaption] = useState(post.caption);
  const [violations, setViolations] = useState<string[] | null>(post.ymylFlags);
  const [rendering, setRendering] = useState(false);
  const [urls, setUrls] = useState(renderUrls);
  const [premium, setPremium] = useState<string | null>(post.premiumTier);
  const [describe, setDescribe] = useState("");
  const [overlay, setOverlay] = useState(false);
  const [pending, startTransition] = useTransition();

  const act = (fn: () => Promise<{ ok?: boolean; error?: string; violations?: string[] }>, done: string) =>
    startTransition(async () => {
      const res = await fn();
      if (res.error) {
        toast(res.error);
        if (res.violations) setViolations(res.violations);
      } else {
        toast(done);
        router.push("/social");
        router.refresh();
      }
    });

  const saveEdit = () =>
    startTransition(async () => {
      const res = await updatePostCaption(post.id, caption);
      if (res.error) {
        toast(res.error);
        if (res.violations) setViolations(res.violations);
      } else {
        toast("Saved — content checks passed.");
        setViolations(null);
        setEditing(false);
        router.refresh();
      }
    });

  const render = async (premium?: string) => {
    setRendering(true);
    try {
      const res = await fetch("/api/social/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          ...(premium ? { premium } : {}),
          ...(describe.trim() ? { describe: describe.trim() } : {}),
          ...(overlay ? { overlay: true } : {}),
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

  const igImage = urls[0];

  return (
    <div className="mt-6 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <PlatformBadge platform={post.platform} />
        <StatusBadge status={post.status} />
        {post.topic ? (
          <span className="text-xs text-text-secondary">· {post.topic}</span>
        ) : null}
      </div>

      {violations && violations.length > 0 ? (
        <div className="rounded-card border border-danger/30 bg-danger/5 p-4">
          <p className="text-sm font-semibold text-danger">
            Content checks flagged this post — edit it before it can go out:
          </p>
          <ul className="mt-2 list-disc pl-5 text-sm text-text-primary">
            {violations.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {post.softWarnings.length > 0 ? (
        <div className="rounded-card border border-warning/30 bg-warning/5 p-4">
          <p className="text-sm font-semibold text-warning">Google Business tips</p>
          <ul className="mt-2 list-disc pl-5 text-sm text-text-primary">
            {post.softWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ---- Platform-true preview ---- */}
      {post.platform === "instagram" ? (
        <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
          <div className="flex items-center gap-2.5 p-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {clinicName.slice(0, 1)}
            </div>
            <p className="text-sm font-semibold">{clinicName.toLowerCase().replace(/[^a-z0-9]+/g, "")}</p>
          </div>
          {igImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={igImage} alt="Post image" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-subtle">
              <p className="text-sm text-text-secondary">
                {post.format === "carousel" ? "6-slide carousel" : "Post image"} — add one below
              </p>
            </div>
          )}
          <div className="p-3 text-[15px] leading-relaxed">
            <span className="font-semibold">{clinicName.toLowerCase().replace(/[^a-z0-9]+/g, "")}</span>{" "}
            <span className="whitespace-pre-wrap">{caption}</span>
            <p className="mt-2 text-primary">{post.hashtags.join(" ")}</p>
          </div>
        </div>
      ) : null}

      {post.platform === "facebook" ? (
        <div className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {clinicName.slice(0, 1)}
            </div>
            <div>
              <p className="text-sm font-semibold">{clinicName}</p>
              <p className="text-xs text-text-secondary">Just now · 🌐</p>
            </div>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{caption}</p>
          {post.hashtags.length > 0 ? (
            <p className="mt-2 text-[15px] text-primary">{post.hashtags.join(" ")}</p>
          ) : null}
        </div>
      ) : null}

      {post.platform === "gbp" ? (
        <div className="rounded-card border border-border bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">{clinicName}</p>
            <span className="rounded-pill bg-subtle px-2.5 py-0.5 text-xs uppercase text-text-secondary">
              {post.gbpPostType ?? "update"}
            </span>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{caption}</p>
          <p className="mt-3 text-sm font-medium text-primary">Learn more</p>
        </div>
      ) : null}

      {/* ---- Image (every platform supports a post image) ---- */}
      <ImageStudio
        format={post.format}
        urls={urls}
        rendering={rendering}
        premium={premium}
        describe={describe}
        onDescribe={setDescribe}
        overlay={overlay}
        onOverlay={setOverlay}
        onRender={render}
      >
        <UploadPhoto
          postId={post.id}
          onUploaded={(u) => {
            setUrls(u);
            setPremium(null);
          }}
        />
      </ImageStudio>

      {/* ---- Edit ---- */}
      {editing ? (
        <div className="space-y-3">
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={8}
            className="w-full rounded-card border border-border p-4 text-[15px] focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={pending}
              className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white disabled:opacity-60"
            >
              {pending ? "Checking…" : "Save (re-checks content)"}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setCaption(post.caption);
              }}
              className="flex h-11 items-center rounded-button border border-border bg-white px-4 text-[15px] font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          {post.status === "pending_approval" ? (
            <>
              <button
                onClick={() => act(() => approvePost(post.id), "Approved — ready to post.")}
                disabled={pending || !!violations?.length}
                className="flex h-12 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                Approve
              </button>
              <button
                onClick={() => setEditing(true)}
                className="flex h-12 flex-1 items-center justify-center rounded-button border border-border bg-white px-4 text-[15px] font-medium"
              >
                Edit
              </button>
              <button
                onClick={() => act(() => rejectPost(post.id), "Rejected.")}
                disabled={pending}
                className="flex h-12 flex-1 items-center justify-center rounded-button border border-danger/30 bg-white px-4 text-[15px] font-medium text-danger disabled:opacity-60"
              >
                Reject
              </button>
            </>
          ) : post.status === "draft" ? (
            <>
              <button
                onClick={() =>
                  act(() => submitForApproval(post.id), "Sent for approval.")
                }
                disabled={pending || !!violations?.length}
                className="flex h-12 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                Send for approval
              </button>
              <button
                onClick={() => setEditing(true)}
                className="flex h-12 flex-1 items-center justify-center rounded-button border border-border bg-white px-4 text-[15px] font-medium"
              >
                Edit
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex h-12 flex-1 items-center justify-center rounded-button border border-border bg-white px-4 text-[15px] font-medium"
            >
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
