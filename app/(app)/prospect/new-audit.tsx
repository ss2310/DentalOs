"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { LocationPicker } from "@/components/location-picker";
import { runAudit } from "./actions";

const field =
  "h-11 w-full rounded-button border border-border bg-white px-3 text-[15px] text-text-primary placeholder:text-text-secondary";
const label = "text-sm font-medium text-text-primary";

export function NewAudit({
  remaining,
  cap,
}: {
  remaining: number;
  cap: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [f, setF] = useState({
    business_name: "",
    area: "",
    city: "",
    keyword: "",
    center_lat: "",
    center_lng: "",
    grid_size: "5",
    radius_km: "3",
    place_id: "",
  });

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  const requests = useMemo(() => {
    const g = Number(f.grid_size);
    return [3, 5, 7].includes(g) ? g * g : 25;
  }, [f.grid_size]);

  const overBudget = remaining < 1;

  function submit() {
    if (!f.business_name.trim()) return toast("Business name is required.");
    if (!f.keyword.trim()) return toast("A primary keyword is required.");
    if (!f.center_lat || !f.center_lng)
      return toast("Enter the centre latitude and longitude.");

    startTransition(async () => {
      const res = await runAudit(f);
      if (res.error) {
        toast(res.error);
        return;
      }
      toast("Audit complete ✓");
      setOpen(false);
      if (res.id) router.push(`/prospect/${res.id}`);
      else router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 items-center gap-1.5 rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90"
      >
        + New Audit
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="New Prospect Audit">
        <div className="space-y-4">
          <div>
            <label className={label}>Business name</label>
            <input
              className={`mt-1 ${field}`}
              value={f.business_name}
              onChange={set("business_name")}
              placeholder="e.g. Bright Smile Dental"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Area</label>
              <input
                className={`mt-1 ${field}`}
                value={f.area}
                onChange={set("area")}
                placeholder="e.g. Vijay Nagar"
              />
            </div>
            <div>
              <label className={label}>City</label>
              <input
                className={`mt-1 ${field}`}
                value={f.city}
                onChange={set("city")}
                placeholder="e.g. Indore"
              />
            </div>
          </div>

          <div>
            <label className={label}>Primary keyword</label>
            <input
              className={`mt-1 ${field}`}
              value={f.keyword}
              onChange={set("keyword")}
              placeholder="e.g. dentist near me"
            />
          </div>

          <div>
            <label className={label}>Business location</label>
            <div className="mt-1">
              <LocationPicker
                lat={f.center_lat}
                lng={f.center_lng}
                onChange={(a, b) =>
                  setF((s) => ({ ...s, center_lat: a, center_lng: b }))
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Grid size</label>
              <select
                className={`mt-1 ${field}`}
                value={f.grid_size}
                onChange={set("grid_size")}
              >
                <option value="3">3 × 3 (9 points)</option>
                <option value="5">5 × 5 (25 points)</option>
                <option value="7">7 × 7 (49 points)</option>
              </select>
            </div>
            <div>
              <label className={label}>Radius (km)</label>
              <input
                className={`mt-1 ${field}`}
                value={f.radius_km}
                onChange={set("radius_km")}
                inputMode="decimal"
                placeholder="3"
              />
            </div>
          </div>

          <div>
            <label className={label}>Place ID (optional)</label>
            <input
              className={`mt-1 ${field}`}
              value={f.place_id}
              onChange={set("place_id")}
              placeholder="Exact-match the listing (optional)"
            />
          </div>

          {/* Confirm cost first */}
          <div className="rounded-button border border-border bg-subtle px-3 py-2 text-sm text-text-primary">
            This audit makes <span className="font-semibold">{requests}</span>{" "}
            requests and uses <span className="font-semibold">1</span> of your{" "}
            {cap} monthly audits ({remaining} left).
          </div>
          {overBudget ? (
            <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              You&apos;ve used all {cap} audits this month. Credit top-ups are
              coming once payments go live.
            </p>
          ) : null}

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
              onClick={submit}
              disabled={pending || overBudget}
              className="flex h-11 flex-1 items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? "Auditing…" : "Run Audit"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
