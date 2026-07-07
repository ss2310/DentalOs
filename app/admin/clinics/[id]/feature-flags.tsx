"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/toast";
import { FEATURE_FLAGS, flagOn } from "@/lib/admin/feature-flags";
import { setClinicFeatureFlag } from "../actions";

/** Per-clinic feature toggles (admin-editable). Optimistic, reverts on error. */
export function FeatureFlagsEditor({
  clinicId,
  flags,
}: {
  clinicId: string;
  flags: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local view so the switch reacts instantly; server refresh reconciles it.
  const [state, setState] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FEATURE_FLAGS.map((f) => [f.key, flagOn(flags, f.key)])),
  );

  function toggle(key: string, next: boolean) {
    setState((s) => ({ ...s, [key]: next }));
    startTransition(async () => {
      const res = await setClinicFeatureFlag(clinicId, key, next);
      if (res.error) {
        setState((s) => ({ ...s, [key]: !next })); // revert
        toast(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-border rounded-card border border-border bg-white">
      {FEATURE_FLAGS.map((f) => {
        const on = state[f.key];
        return (
          <div key={f.key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-text-primary">{f.label}</p>
              <p className="text-sm text-text-secondary">{f.help}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={`${f.label} ${on ? "on" : "off"}`}
              disabled={pending}
              onClick={() => toggle(f.key, !on)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors disabled:opacity-60 ${
                on ? "bg-[#4F46E5]" : "bg-black/15"
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
  );
}
