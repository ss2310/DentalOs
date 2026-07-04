// Types for the pure JS retention module (lib/voice-notes-purge.mjs). Kept as a
// sibling .d.ts so the .mjs stays runnable by `node --test` with zero build step
// while TS callers (the cron route) still get full typing.

export const RETENTION_DAYS: number;

export interface PurgeRow {
  id: string;
  audio_path: string | null;
  status: string;
  created_at: string;
}

export interface PurgeOpts {
  nowMs: number;
  retentionDays?: number;
}

export function isAudioPurgeCandidate(row: PurgeRow, opts: PurgeOpts): boolean;

export function selectAudioPurge(
  rows: PurgeRow[],
  opts: PurgeOpts,
): { ids: string[]; paths: string[] };
