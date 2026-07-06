// Tests for the Deep Audit Stage-4 self-citation matcher (lib/audit/self-match.mjs).
// Proves: full-name match, case/punctuation/apostrophe insensitivity, that we do
// NOT over-strip to a bare token (no false positives), source-URL / title matches,
// clinic-domain matches, and that the EXACT matched string is returned so every
// positive is defensible.
//   node --test scripts/test-audit-self-match.mjs   (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSelf, normalize } from "../lib/audit/self-match.mjs";

const NAME = "Dr. Mahima's Dental Care";
const SITE = "https://drmahimasdental.in/";

test("normalize collapses punctuation, case, and apostrophes", () => {
  assert.equal(normalize("Dr. Mahima's Dental Care"), "dr mahimas dental care");
  assert.equal(normalize("Dr Mahimas  Dental-Care"), "dr mahimas dental care");
  assert.equal(normalize("DR. MAHIMA’S DENTAL CARE"), "dr mahimas dental care"); // curly apostrophe
});

test("full name in answer text → matched, exact stored string returned", () => {
  const r = matchSelf({
    name: NAME,
    websiteUrl: SITE,
    answerText: "For trusted care, Dr. Mahima's Dental Care in Talwandi is well reviewed.",
    sources: [],
  });
  assert.equal(r.matched, true);
  assert.equal(r.matchedString, NAME);
  assert.equal(r.matchedIn, "answer_text");
});

test("possessive-apostrophe spelling variants all match", () => {
  for (const phrase of [
    "visit Dr Mahima's Dental Care today",
    "Dr. Mahimas Dental Care is open late",
    "we recommend dr mahima’s dental care", // curly + lowercase
  ]) {
    const r = matchSelf({ name: NAME, websiteUrl: SITE, answerText: phrase, sources: [] });
    assert.equal(r.matched, true, `should match: ${phrase}`);
    assert.equal(r.matchedString, NAME);
  }
});

test("does NOT over-strip: a bare 'Mahima' does not false-positive", () => {
  const r = matchSelf({
    name: NAME,
    websiteUrl: SITE,
    answerText: "Mahima Sweets and the Mahima textile shop are nearby.",
    sources: [],
  });
  assert.equal(r.matched, false);
  assert.equal(r.matchedString, null);
});

test("partial 'Dr. Mahima's' without 'Dental Care' does not match (full name is the name)", () => {
  const r = matchSelf({
    name: NAME,
    websiteUrl: SITE,
    answerText: "Dr. Mahima's clinic hours are 9-5.",
    sources: [],
  });
  assert.equal(r.matched, false);
});

test("full name in a source title matches (matchedIn=source)", () => {
  const r = matchSelf({
    name: NAME,
    websiteUrl: SITE,
    answerText: "Here are some options.",
    sources: [{ url: "https://justdial.com/x", title: "Dr. Mahima's Dental Care - Reviews" }],
  });
  assert.equal(r.matched, true);
  assert.equal(r.matchedString, NAME);
  assert.equal(r.matchedIn, "source");
});

test("clinic's own domain among sources matches (matchedIn=source_domain, string=host)", () => {
  const r = matchSelf({
    name: NAME,
    websiteUrl: SITE,
    answerText: "Several clinics serve the area.",
    sources: [{ url: "https://www.drmahimasdental.in/about", title: "About" }],
  });
  assert.equal(r.matched, true);
  assert.equal(r.matchedString, "drmahimasdental.in");
  assert.equal(r.matchedIn, "source_domain");
});

test("genuine negative: engine answered, clinic absent everywhere", () => {
  const r = matchSelf({
    name: NAME,
    websiteUrl: SITE,
    answerText: "Smile and Sujok Dental and City Dental are the top-rated options.",
    sources: [{ url: "https://smileandsujok.com", title: "Smile & Sujok" }],
  });
  assert.equal(r.matched, false);
  assert.equal(r.matchedString, null);
  assert.equal(r.matchedIn, null);
});

test("empty name never matches (guards a missing self entity)", () => {
  const r = matchSelf({ name: "", websiteUrl: SITE, answerText: "anything at all", sources: [] });
  assert.equal(r.matched, false);
});
