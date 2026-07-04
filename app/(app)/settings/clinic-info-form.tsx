"use client";

import { useEffect, useState } from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { toast } from "@/components/toast";
import { LocationPicker } from "@/components/location-picker";
import { updateClinic, type SettingsState } from "./actions";

export type Clinic = {
  business_name: string | null;
  doctor_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  google_review_url: string | null;
  instagram_handle: string | null;
  website_url: string | null;
  default_lat: number | null;
  default_lng: number | null;
};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

const initialState: SettingsState = {};

export function ClinicInfoForm({ clinic }: { clinic: Clinic }) {
  const [state, formAction] = useFormState(updateClinic, initialState);
  const router = useRouter();
  const [lat, setLat] = useState(
    clinic.default_lat != null ? String(clinic.default_lat) : "",
  );
  const [lng, setLng] = useState(
    clinic.default_lng != null ? String(clinic.default_lng) : "",
  );

  useEffect(() => {
    if (state.ok) {
      toast("Clinic details saved ✓");
      router.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      action={formAction}
      className="max-w-2xl rounded-card border border-border bg-white p-5"
    >
      {state.error ? (
        <p className="mb-4 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="business_name" className={labelClass}>
              Clinic name <span className="text-danger">*</span>
            </label>
            <input
              id="business_name"
              name="business_name"
              required
              defaultValue={clinic.business_name ?? ""}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="doctor_name" className={labelClass}>
              Doctor name
            </label>
            <input
              id="doctor_name"
              name="doctor_name"
              defaultValue={clinic.doctor_name ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone <span className="text-danger">*</span>
            </label>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              required
              defaultValue={clinic.phone ?? ""}
              className={inputClass}
              placeholder="98XXXXXXXX"
            />
          </div>
          <div>
            <label htmlFor="city" className={labelClass}>
              City
            </label>
            <input
              id="city"
              name="city"
              defaultValue={clinic.city ?? ""}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="area" className={labelClass}>
              Area
            </label>
            <input
              id="area"
              name="area"
              defaultValue={clinic.area ?? ""}
              className={inputClass}
              placeholder="Andheri West"
            />
          </div>
          <div>
            <label htmlFor="instagram_handle" className={labelClass}>
              Instagram handle
            </label>
            <input
              id="instagram_handle"
              name="instagram_handle"
              defaultValue={clinic.instagram_handle ?? ""}
              className={inputClass}
              placeholder="@yourclinic"
            />
          </div>
        </div>

        <div>
          <label htmlFor="address" className={labelClass}>
            Address
          </label>
          <input
            id="address"
            name="address"
            defaultValue={clinic.address ?? ""}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="google_review_url" className={labelClass}>
            Google review URL
          </label>
          <input
            id="google_review_url"
            name="google_review_url"
            type="url"
            defaultValue={clinic.google_review_url ?? ""}
            className={inputClass}
            placeholder="https://g.page/…/review"
          />
        </div>

        <div>
          <label htmlFor="website_url" className={labelClass}>
            Website URL
          </label>
          <input
            id="website_url"
            name="website_url"
            type="url"
            defaultValue={clinic.website_url ?? ""}
            className={inputClass}
            placeholder="https://…"
          />
        </div>

        {/* Clinic location — the single source of truth for Map Rank scans. */}
        <div className="border-t border-border pt-4">
          <label className={labelClass}>Clinic location</label>
          <p className="mb-2 -mt-1 text-sm text-text-secondary">
            Set this once — Map Rank scans centre on it, so you never enter
            coordinates per keyword.
          </p>
          <LocationPicker
            lat={lat}
            lng={lng}
            onChange={(a, b) => {
              setLat(a);
              setLng(b);
            }}
          />
          <input type="hidden" name="default_lat" value={lat} />
          <input type="hidden" name="default_lng" value={lng} />
        </div>
      </div>

      <div className="mt-6 sm:max-w-[200px]">
        <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
      </div>
    </form>
  );
}
