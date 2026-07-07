"use client";

import { useState, useTransition } from "react";
import { FEATURE_FLAGS } from "@/lib/admin/feature-flags";
import { setFeatureFlagDefault } from "./actions";

export type FlagDefault = { flag_key: string; enabled: boolean };

export function FeatureDefaults({ defaults }: { defaults: FlagDefault[] }) {
  // Start from the registry (so every flag shows even if unseeded), overlaid
  // with the stored defaults.
  const stored = new Map(defaults.map((d) => [d.flag_key, d.enabled]));
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, stored.get(f.key) ?? false])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (key: string, next: boolean) => {
    setError(null);
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      const res = await setFeatureFlagDefault(key, next);
      if (res.error) {
        setState((s) => ({ ...s, [key]: !next })); // revert
        setError(res.error);
      }
    });
  };

  return (
    <div>
      {error ? (
        <p className="mb-3 rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="divide-y divide-border overflow-hidden rounded-card border border-border bg-white shadow-card">
        {FEATURE_FLAGS.map((f) => {
          const on = state[f.key] ?? false;
          return (
            <div key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-text-primary">{f.label}</p>
                <p className="text-xs text-text-secondary">{f.help}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`Toggle default for ${f.label}`}
                disabled={pending}
                onClick={() => toggle(f.key, !on)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors disabled:opacity-50 ${
                  on ? "bg-[#4F46E5]" : "bg-border"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-pill bg-white shadow transition-transform ${
                    on ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-text-secondary">
        These are the platform-wide defaults for each feature. Per-clinic
        overrides live on each clinic&apos;s detail page.
      </p>
    </div>
  );
}
