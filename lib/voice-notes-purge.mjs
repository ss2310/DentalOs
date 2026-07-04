// Pure retention logic for voice-note audio, kept dependency-free so it can be
// unit-tested with Node's built-in runner (see scripts/test-audio-purge.mjs) and
// shared by the cron route. The rule the cron implements:
//   an audio clip is purged once its note is `confirmed` (the transcript is the
//   record) OR the note is older than the retention window, whichever comes first.
// The transcript row itself is always kept — only `audio_path` is cleared.

export const RETENTION_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Should this note's audio be purged now?
 * @param {{ audio_path: string|null, status: string, created_at: string }} row
 * @param {{ nowMs: number, retentionDays?: number }} opts
 * @returns {boolean}
 */
export function isAudioPurgeCandidate(row, opts) {
  if (!row || !row.audio_path) return false; // nothing to purge
  if (row.status === "confirmed") return true; // transcript is the record
  const created = Date.parse(row.created_at);
  if (Number.isNaN(created)) return false; // unparseable date → leave it
  const retentionDays = opts.retentionDays ?? RETENTION_DAYS;
  return created < opts.nowMs - retentionDays * DAY_MS;
}

/**
 * Split a batch of note rows into the ids to clear and the object paths to
 * remove. Only candidates are included.
 * @param {Array<{ id: string, audio_path: string|null, status: string, created_at: string }>} rows
 * @param {{ nowMs: number, retentionDays?: number }} opts
 * @returns {{ ids: string[], paths: string[] }}
 */
export function selectAudioPurge(rows, opts) {
  const ids = [];
  const paths = [];
  for (const row of rows ?? []) {
    if (isAudioPurgeCandidate(row, opts)) {
      ids.push(row.id);
      if (row.audio_path) paths.push(row.audio_path);
    }
  }
  return { ids, paths };
}
