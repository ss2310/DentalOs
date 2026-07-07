// Unit tests for the voice-note audio retention rule (lib/voice-notes-purge.mjs).
// Runs with Node's built-in runner — no framework, no build step:
//   node --test scripts/test-audio-purge.mjs   (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RETENTION_DAYS,
  isAudioPurgeCandidate,
  selectAudioPurge,
} from "../lib/voice-notes-purge.mjs";

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-04T12:00:00Z");
const opts = { nowMs: NOW, retentionDays: RETENTION_DAYS };

const iso = (offsetDays) => new Date(NOW + offsetDays * DAY).toISOString();

test("confirmed note with audio is purged regardless of age", () => {
  const row = { id: "a", audio_path: "c/a.webm", status: "confirmed", created_at: iso(0) };
  assert.equal(isAudioPurgeCandidate(row, opts), true);
});

test("pending note older than the retention window is purged", () => {
  const row = { id: "b", audio_path: "c/b.webm", status: "pending_review", created_at: iso(-8) };
  assert.equal(isAudioPurgeCandidate(row, opts), true);
});

test("pending note within the retention window is kept", () => {
  const row = { id: "c", audio_path: "c/c.webm", status: "pending_review", created_at: iso(-3) };
  assert.equal(isAudioPurgeCandidate(row, opts), false);
});

test("a note whose audio is already gone is never a candidate", () => {
  const row = { id: "d", audio_path: null, status: "confirmed", created_at: iso(-30) };
  assert.equal(isAudioPurgeCandidate(row, opts), false);
});

test("exactly at the boundary (7 days) is kept; just past it is purged", () => {
  const atBoundary = { id: "e", audio_path: "c/e.webm", status: "failed", created_at: iso(-RETENTION_DAYS) };
  const pastBoundary = { id: "f", audio_path: "c/f.webm", status: "failed", created_at: iso(-RETENTION_DAYS - 0.001) };
  assert.equal(isAudioPurgeCandidate(atBoundary, opts), false);
  assert.equal(isAudioPurgeCandidate(pastBoundary, opts), true);
});

test("unparseable created_at is left alone (fails safe)", () => {
  const row = { id: "g", audio_path: "c/g.webm", status: "processing", created_at: "not-a-date" };
  assert.equal(isAudioPurgeCandidate(row, opts), false);
});

test("selectAudioPurge returns ids + paths for candidates only", () => {
  const rows = [
    { id: "1", audio_path: "c/1.webm", status: "confirmed", created_at: iso(0) },      // purge
    { id: "2", audio_path: "c/2.webm", status: "pending_review", created_at: iso(-2) }, // keep
    { id: "3", audio_path: "c/3.webm", status: "failed", created_at: iso(-10) },        // purge
    { id: "4", audio_path: null, status: "confirmed", created_at: iso(-99) },           // keep (no audio)
  ];
  const { ids, paths } = selectAudioPurge(rows, opts);
  assert.deepEqual(ids, ["1", "3"]);
  assert.deepEqual(paths, ["c/1.webm", "c/3.webm"]);
});

test("selectAudioPurge tolerates an empty/nullish batch", () => {
  assert.deepEqual(selectAudioPurge([], opts), { ids: [], paths: [] });
  assert.deepEqual(selectAudioPurge(null, opts), { ids: [], paths: [] });
});
