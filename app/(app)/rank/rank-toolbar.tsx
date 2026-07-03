"use client";

import { useEffect, useState, useTransition } from "react";
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
  defaultLat,
  defaultLng,
}: {
  defaultBusiness: string;
  defaultLat: string;
  defaultLng: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [keyword, setKeyword] = useState("");
  const [business, setBusiness] = useState(defaultBusiness);
  const [placeId, setPlaceId] = useState("");
  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);
  const [gridSize, setGridSize] = useState("5");
  const [radius, setRadius] = useState("3");
  const [error, setError] = useState<string | null>(null);

  // Google Maps' "click to copy" puts "lat, lng" on the clipboard as one string.
  // If that's pasted into the Latitude box, split it across both fields.
  function handleLatInput(value: string) {
    if (value.includes(",")) {
      const [a, b] = value.split(",");
      setLat(a.trim());
      if (b !== undefined) setLng(b.trim());
    } else {
      setLat(value);
    }
  }

  useEffect(() => {
    if (open) {
      setKeyword("");
      setBusiness(defaultBusiness);
      setPlaceId("");
      setLat(defaultLat);
      setLng(defaultLng);
      setGridSize("5");
      setRadius("3");
      setError(null);
    }
  }, [open, defaultBusiness, defaultLat, defaultLng]);

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
        center_lat: lat,
        center_lng: lng,
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
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
          >
            <PlusIcon />
            <span className="hidden sm:inline">Add Keyword</span>
            <span className="sm:hidden">Add</span>
          </button>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rk_lat" className={labelClass}>
                Centre latitude <span className="text-danger">*</span>
              </label>
              <input
                id="rk_lat"
                value={lat}
                onChange={(e) => handleLatInput(e.target.value)}
                inputMode="decimal"
                className={inputClass}
                placeholder="28.6139"
              />
            </div>
            <div>
              <label htmlFor="rk_lng" className={labelClass}>
                Centre longitude <span className="text-danger">*</span>
              </label>
              <input
                id="rk_lng"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                className={inputClass}
                placeholder="77.2090"
              />
            </div>
          </div>

          <div className="rounded-button border border-border bg-subtle p-3 text-sm text-text-secondary">
            <p className="font-medium text-text-primary">
              How to get your latitude &amp; longitude
            </p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-4">
              <li>Open Google Maps and find your clinic&apos;s red pin.</li>
              <li>
                Right-click (or long-press on phone) exactly on the pin.
              </li>
              <li>
                At the top of the menu you&apos;ll see two numbers like{" "}
                <span className="font-medium text-text-primary">
                  28.6139, 77.2090
                </span>{" "}
                — click them once to copy.
              </li>
              <li>
                Paste into the <span className="font-medium">Latitude</span> box
                above — we&apos;ll automatically split them into Latitude and
                Longitude.
              </li>
            </ol>
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
