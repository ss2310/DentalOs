// Unit tests: social post status machine (lib/social/status.mjs).
// Run: node --test scripts/test-social-status.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_STATUSES,
  canTransition,
  assertTransition,
} from "../lib/social/status.mjs";

test("happy path: draft → pending_approval → approved → posted_manually", () => {
  assert.equal(canTransition("draft", "pending_approval"), true);
  assert.equal(canTransition("pending_approval", "approved"), true);
  assert.equal(canTransition("approved", "posted_manually"), true);
});

test("rejection branches from pending_approval only", () => {
  assert.equal(canTransition("pending_approval", "rejected"), true);
  assert.equal(canTransition("draft", "rejected"), false);
  assert.equal(canTransition("approved", "rejected"), false);
});

test("illegal transitions are rejected (the spec's named test)", () => {
  // Skipping approval entirely:
  assert.equal(canTransition("draft", "posted_manually"), false);
  assert.equal(canTransition("draft", "approved"), false);
  assert.equal(canTransition("pending_approval", "posted_manually"), false);
  // Terminal states never move:
  assert.equal(canTransition("posted_manually", "draft"), false);
  assert.equal(canTransition("rejected", "pending_approval"), false);
  // Unknown states:
  assert.equal(canTransition("published_via_api", "posted_manually"), false);
  assert.throws(
    () => assertTransition("draft", "posted_manually"),
    /Illegal status transition/,
  );
});

test("assertTransition allows a legal move", () => {
  assert.doesNotThrow(() => assertTransition("approved", "posted_manually"));
});

test("status list matches the DB CHECK set", () => {
  assert.deepEqual(SOCIAL_STATUSES, [
    "draft",
    "pending_approval",
    "approved",
    "posted_manually",
    "rejected",
  ]);
});
