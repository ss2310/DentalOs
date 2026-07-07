"use client";

import { useState } from "react";
import { parseLatLng } from "@/lib/geo";

// Set a location WITHOUT typing raw coordinates: one tap to use the device's
// GPS (ideal on a phone at the clinic), or paste a Google Maps link. The
// lat/lng fields stay visible + editable as the fallback. Controlled by the
// parent so it works inside both React-state forms and FormData forms (which
// read the hidden inputs the parent renders from these values).

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

export function LocationPicker({
  lat,
  lng,
  onChange,
}: {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
}) {
  const [paste, setPaste] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  function useCurrent() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus({ ok: false, msg: "This device can't share its location." });
      return;
    }
    setBusy(true);
    setStatus({ ok: true, msg: "Getting your location…" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange(
          pos.coords.latitude.toFixed(6),
          pos.coords.longitude.toFixed(6),
        );
        setBusy(false);
        setStatus({ ok: true, msg: "Location set from your device ✓" });
      },
      (err) => {
        setBusy(false);
        setStatus({
          ok: false,
          msg:
            err.code === err.PERMISSION_DENIED
              ? "Location permission denied — paste a Google Maps link instead."
              : "Couldn't get your location — paste a Google Maps link instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function tryParse(value: string) {
    setPaste(value);
    const hit = parseLatLng(value);
    if (hit) {
      onChange(hit.lat.toFixed(6), hit.lng.toFixed(6));
      setStatus({ ok: true, msg: "Location read from link ✓" });
    } else if (value.trim()) {
      setStatus({
        ok: false,
        msg: "Couldn't read coordinates — paste the full Google Maps link.",
      });
    } else {
      setStatus(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={useCurrent}
          disabled={busy}
          className="flex h-11 items-center justify-center gap-1.5 rounded-button border border-primary/30 bg-primary/5 px-4 text-[15px] font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          📍 {busy ? "Locating…" : "Use my current location"}
        </button>
        <input
          value={paste}
          onChange={(e) => tryParse(e.target.value)}
          className={`${inputClass} flex-1`}
          placeholder="…or paste a Google Maps link / 28.6139, 77.2090"
        />
      </div>

      {status ? (
        <p className={`text-sm ${status.ok ? "text-success" : "text-danger"}`}>
          {status.msg}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Latitude</label>
          <input
            value={lat}
            onChange={(e) => onChange(e.target.value, lng)}
            inputMode="decimal"
            className={inputClass}
            placeholder="28.6139"
          />
        </div>
        <div>
          <label className={labelClass}>Longitude</label>
          <input
            value={lng}
            onChange={(e) => onChange(lat, e.target.value)}
            inputMode="decimal"
            className={inputClass}
            placeholder="77.2090"
          />
        </div>
      </div>

      <p className="text-xs text-text-secondary">
        On a phone at the clinic, tap “Use my current location”. Otherwise open
        Google Maps, find your clinic, and copy the link into the box above.
      </p>
    </div>
  );
}
