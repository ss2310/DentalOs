"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "@/components/toast";
import { deleteMoment } from "../actions";

type PostRef = { status: string; platform: string };

const POST_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "In approval",
  approved: "Ready to post",
  posted_manually: "Posted ✓",
  rejected: "Rejected",
};

export function GalleryCard({
  moment,
}: {
  moment: {
    id: string;
    patientName: string;
    treatment: string | null;
    thumbUrl: string | null;
    hasBefore: boolean;
    consentType: string;
    reviewAsked: boolean;
    createdLabel: string;
    posts: PostRef[];
    canCompose: boolean;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = () => {
    if (
      !window.confirm(
        "Delete this moment? Use this when the patient withdraws consent — the photos are removed permanently.",
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteMoment(moment.id);
      if (res.error) toast(res.error);
      else {
        toast("Moment deleted.");
        router.refresh();
      }
    });
  };

  const posted = moment.posts.find((p) => p.status === "posted_manually");
  const activePost = posted ?? moment.posts[0];

  return (
    <div className="overflow-hidden rounded-card border border-border bg-white shadow-card">
      <div className="relative aspect-square bg-subtle">
        {moment.thumbUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={moment.thumbUrl} alt="Result" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-text-secondary">
            No preview
          </div>
        )}
        {moment.hasBefore ? (
          <span className="absolute left-2 top-2 rounded-pill bg-black/50 px-2 py-0.5 text-xs font-medium text-white backdrop-blur">
            Before + After
          </span>
        ) : null}
        <span
          className={`absolute right-2 top-2 rounded-pill px-2 py-0.5 text-xs font-medium backdrop-blur ${
            moment.consentType === "review_and_social"
              ? "bg-primary/85 text-white"
              : "bg-black/50 text-white"
          }`}
        >
          {moment.consentType === "review_and_social" ? "Social OK" : "Review only"}
        </span>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-medium">{moment.patientName}</p>
        <p className="truncate text-xs text-text-secondary">
          {[moment.treatment, moment.createdLabel].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {moment.reviewAsked ? (
            <span className="rounded-pill bg-success/10 px-2 py-0.5 text-xs text-success">
              ✓ Review asked
            </span>
          ) : null}
          {activePost ? (
            <span className="rounded-pill bg-subtle px-2 py-0.5 text-xs text-text-secondary">
              {POST_STATUS_LABEL[activePost.status] ?? activePost.status}
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          {moment.canCompose ? (
            <Link
              href={`/capture/${moment.id}/compose`}
              className="flex h-10 flex-1 items-center justify-center rounded-button bg-primary text-sm font-medium text-white hover:bg-primary/90"
            >
              Compose post
            </Link>
          ) : null}
          <button
            onClick={remove}
            disabled={pending}
            className="flex h-10 min-w-[44px] items-center justify-center rounded-button border border-border text-sm text-text-secondary hover:text-danger disabled:opacity-60"
            title="Delete (consent withdrawn)"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
}
