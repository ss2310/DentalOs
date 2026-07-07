"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { saveBrandKit } from "../social/actions";

export type BrandKitInfo = {
  primary_color: string;
  secondary_color: string;
  font: string;
  hasLogo: boolean;
};

/**
 * Logo upload, surfaced in Settings → Clinic Info so it's findable without
 * knowing the Brand Personality wizard exists. Reuses the SAME saveBrandKit
 * action as the wizard (colors/font ride along unchanged as hidden fields),
 * so there is exactly one write path for the brand kit.
 */
export function BrandLogoCard({
  kit,
  logoUrl,
}: {
  kit: BrandKitInfo;
  logoUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="mt-4 max-w-2xl rounded-card border border-border bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium uppercase tracking-wide text-text-secondary">
          Logo &amp; brand
        </p>
        <Link
          href="/social/brand"
          className="text-sm font-medium text-primary hover:underline"
        >
          Full brand settings →
        </Link>
      </div>
      <p className="mt-2 text-sm text-text-secondary">
        Your logo is stamped onto every social post image and carousel slide.
      </p>

      <form
        action={(fd) =>
          startTransition(async () => {
            const file = fd.get("logo");
            if (!(file instanceof File) || file.size === 0) {
              toast("Choose a logo file first.");
              return;
            }
            const res = await saveBrandKit(fd);
            if (res?.error) toast(res.error);
            else {
              toast("Logo saved ✓ — it'll appear on your next rendered post.");
              setFileName(null);
              router.refresh();
            }
          })
        }
        className="mt-4 flex flex-wrap items-center gap-4"
      >
        {/* Colors/font pass through unchanged so this card only touches the logo. */}
        <input type="hidden" name="primary_color" value={kit.primary_color} />
        <input type="hidden" name="secondary_color" value={kit.secondary_color} />
        <input type="hidden" name="font" value={kit.font} />

        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt="Clinic logo"
            className="h-16 w-16 rounded-card border border-border object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-card border border-dashed border-border text-xs text-text-secondary">
            No logo
          </div>
        )}

        <div className="min-w-0 flex-1">
          <label
            htmlFor="settings-logo"
            className="flex h-11 w-fit cursor-pointer items-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
          >
            {fileName ?? (kit.hasLogo ? "Replace logo…" : "Choose logo…")}
          </label>
          <input
            id="settings-logo"
            type="file"
            name="logo"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
          <p className="mt-1.5 text-xs text-text-secondary">
            PNG/JPG/WebP, under 2 MB. Square works best.
          </p>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="flex h-11 items-center rounded-button bg-primary px-4 text-[15px] font-medium text-white disabled:opacity-50"
        >
          {pending ? "Uploading…" : "Save logo"}
        </button>
      </form>
    </div>
  );
}
