"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { PlusIcon } from "@/components/icons";
import { PageHeader } from "@/components/page";
import { addKeyword } from "./actions";

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

export function RankToolbar({
  defaultBusiness,
  hasLocation,
}: {
  defaultBusiness: string;
  // The clinic's location is set once in Settings and used as the scan centre;
  // without it we can't scan, so Add Keyword points the user there instead.
  hasLocation: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [keyword, setKeyword] = useState("");
  const [business, setBusiness] = useState(defaultBusiness);
  const [placeId, setPlaceId] = useState("");
  const [gridSize, setGridSize] = useState("5");
  const [radius, setRadius] = useState("3");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setKeyword("");
      setBusiness(defaultBusiness);
      setPlaceId("");
      setGridSize("5");
      setRadius("3");
      setError(null);
    }
  }, [open, defaultBusiness]);

  function save() {
    if (!keyword.trim()) {
      setError("Keyword is required.");
      return;
    }
    if (!business.trim()) {
      setError("Target business name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addKeyword({
        keyword,
        target_business_name: business,
        target_place_id: placeId,
        grid_size: gridSize,
        radius_km: radius,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      toast("Keyword added ✓");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <PageHeader
        title="Map Rank"
        action={
          hasLocation ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
            >
              <PlusIcon />
              <span className="hidden sm:inline">Add Keyword</span>
              <span className="sm:hidden">Add</span>
            </button>
          ) : (
            <Link
              href="/settings"
              className="flex h-11 items-center gap-1.5 rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
            >
              Set clinic location
            </Link>
          )
        }
      />

      <Modal open={open} onClose={() => setOpen(false)} title="Add Keyword">
        <div className="space-y-4">
          {error ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div>
            <label htmlFor="rk_keyword" className={labelClass}>
              Keyword <span className="text-danger">*</span>
            </label>
            <input
              id="rk_keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className={inputClass}
              placeholder="dentist near me"
            />
          </div>

          <div>
            <label htmlFor="rk_business" className={labelClass}>
              Target business name <span className="text-danger">*</span>
            </label>
            <input
              id="rk_business"
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              className={inputClass}
              placeholder="Your clinic's name on Google"
            />
          </div>

          <div>
            <label htmlFor="rk_place" className={labelClass}>
              Google Place ID <span className="text-text-secondary">(optional)</span>
            </label>
            <input
              id="rk_place"
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              className={inputClass}
              placeholder="ChIJ… — most reliable match if you have it"
            />
          </div>

          <div className="rounded-button border border-border bg-subtle p-3 text-sm text-text-secondary">
            Scans centre on your clinic&apos;s location (set in{" "}
            <span className="font-medium text-text-primary">Settings</span>) — no
            coordinates needed here.
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rk_grid" className={labelClass}>
                Grid size
              </label>
              <select
                id="rk_grid"
                value={gridSize}
                onChange={(e) => setGridSize(e.target.value)}
                className={inputClass}
              >
                <option value="3">3 × 3 (9 points)</option>
                <option value="5">5 × 5 (25 points)</option>
                <option value="7">7 × 7 (49 points)</option>
              </select>
            </div>
            <div>
              <label htmlFor="rk_radius" className={labelClass}>
                Radius (km)
              </label>
              <input
                id="rk_radius"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                inputMode="decimal"
                className={inputClass}
                placeholder="3"
              />
            </div>
          </div>

          <p className="text-sm text-text-secondary">
            Each scan makes one request per grid point ({gridSize}×{gridSize} ={" "}
            {Number(gridSize) * Number(gridSize)} requests).
          </p>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-11 flex-1 items-center justify-center rounded-button border border-border px-4 text-[15px] font-medium text-text-primary hover:bg-subtle"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Add Keyword"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
