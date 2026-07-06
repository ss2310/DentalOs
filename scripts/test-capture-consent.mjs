// Unit tests: Moment Capture consent + anti-abuse logic (lib/capture/consent.mjs).
// Run: node --test scripts/test-capture-consent.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_CONSENT,
  REVIEW_ASK_COOLDOWN_DAYS,
  deriveConsentType,
  canComposeSocially,
  reviewAskAllowed,
  captureReviewMessage,
} from "../lib/capture/consent.mjs";

const DAY = 86_400_000;
const NOW = new Date("2026-07-06T12:00:00Z").getTime();
const daysAgoIso = (d) => new Date(NOW - d * DAY).toISOString();

test("consent_type derivation from the two toggles", () => {
  assert.equal(deriveConsentType(true, true), "review_and_social");
  assert.equal(deriveConsentType(false, true), "review_and_social"); // B-only: photo usable, ask gated separately
  assert.equal(deriveConsentType(true, false), "review_only");
  assert.equal(deriveConsentType(false, false), null); // unsavable — no consent, no storage
});

test("review_only moment is invisible to the social picker (the spec's named test)", () => {
  // The queries filter .eq('consent_type', SOCIAL_CONSENT) — this predicate is
  // that filter's single source of truth.
  assert.equal(canComposeSocially({ consent_type: "review_only" }), false);
  assert.equal(canComposeSocially({ consent_type: "review_and_social" }), true);
  assert.equal(canComposeSocially({ consent_type: null }), false);
  assert.equal(canComposeSocially(null), false);
  assert.equal(SOCIAL_CONSENT, "review_and_social");
});

test("30-day cap: no prior ask → allowed", () => {
  assert.deepEqual(reviewAskAllowed([], NOW), { allowed: true, daysAgo: null });
  assert.deepEqual(reviewAskAllowed([null, undefined], NOW), { allowed: true, daysAgo: null });
});

test("30-day cap blocks a recent ask from ANY surface (surveys or captures)", () => {
  // Survey sent 10 days ago blocks a capture ask…
  const r1 = reviewAskAllowed([daysAgoIso(10)], NOW);
  assert.equal(r1.allowed, false);
  assert.equal(r1.daysAgo, 10);
  // …and the MOST RECENT of mixed sources wins.
  const r2 = reviewAskAllowed([daysAgoIso(45), daysAgoIso(5), null], NOW);
  assert.equal(r2.allowed, false);
  assert.equal(r2.daysAgo, 5);
});

test("30-day cap opens exactly at the boundary", () => {
  assert.equal(reviewAskAllowed([daysAgoIso(29)], NOW).allowed, false);
  assert.equal(reviewAskAllowed([daysAgoIso(REVIEW_ASK_COOLDOWN_DAYS)], NOW).allowed, true);
  assert.equal(reviewAskAllowed([daysAgoIso(90)], NOW).allowed, true);
});

test("review message: Hinglish, includes the link, NEVER a photo, no medical claims", () => {
  const msg = captureReviewMessage("Asha", "https://g.page/r/xyz");
  assert.match(msg, /Asha ji/);
  assert.match(msg, /https:\/\/g\.page\/r\/xyz/);
  assert.match(msg, /review/i);
  // No media/photo reference and no outcome/medical language.
  assert.doesNotMatch(msg, /photo|image|attach/i);
  assert.doesNotMatch(msg, /pain|cure|treatment|result|guarantee/i);
  // Builder has no photo parameter at all (invariant by construction).
  assert.equal(captureReviewMessage.length, 2);
});
