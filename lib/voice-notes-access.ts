import "server-only";

import { flagOn } from "@/lib/admin/feature-flags";

// Server-side access gates for the Voice Notes feature. Two layers stack:
//   1. A GLOBAL kill-switch (ENABLE_VOICE_NOTES) the platform controls.
//   2. The PER-CLINIC `voice_notes` feature flag the clinic owns (toggled in
//      Settings, or by a super-admin).
// A clinic sees Voice Notes only when BOTH are on. Keeping this here (server-only)
// means the env kill-switch never ships to the browser bundle.

/**
 * Global kill-switch. Voice Notes are ON unless ENABLE_VOICE_NOTES is explicitly
 * set to a falsy value (`false`/`0`/`off`/`no`). Lets ops disable the whole
 * feature platform-wide — e.g. if Groq/Anthropic spend spikes — without touching
 * any per-clinic flag. Unset ⇒ enabled (preserves existing behaviour).
 */
export function voiceNotesGloballyEnabled(): boolean {
  const v = (process.env.ENABLE_VOICE_NOTES ?? "").trim().toLowerCase();
  return v !== "false" && v !== "0" && v !== "off" && v !== "no";
}

/**
 * Effective per-clinic enablement: the global switch AND the clinic's own flag.
 * This is the single check every server entry point should use — layout, pages,
 * and the API routes — so the two layers can never drift apart.
 */
export function voiceNotesEnabledForClinic(
  flags: Record<string, unknown> | null | undefined,
): boolean {
  return voiceNotesGloballyEnabled() && flagOn(flags, "voice_notes");
}

/**
 * Per-clinic daily cap on notes CREATED — bounds the Groq + agent spend a single
 * tenant can trigger in a day. Override with VOICE_NOTES_DAILY_CAP; default 100.
 * A zero/negative/NaN override falls back to the default rather than disabling
 * the cap.
 */
export function voiceNotesDailyCap(): number {
  const raw = Number(process.env.VOICE_NOTES_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100;
}
