// Unit tests: deterministic YMYL validator (lib/social/ymyl.mjs).
// Run: node --test scripts/test-social-ymyl.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateYmyl,
  appendDisclaimers,
  describeViolations,
} from "../lib/social/ymyl.mjs";

test("clean tone-safe copy passes", () => {
  const r = validateYmyl(
    "Thand ka mausam aa gaya hai — sensitive teeth ko ignore mat kariye. Checkup ke liye WhatsApp kariye 😊",
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test("poisoned stat is blocked (the spec's named test)", () => {
  // "95%" appears nowhere in the supplied inputs → fabricated → blocked.
  const r = validateYmyl("95% of our patients see results in one visit.", {
    allowedFacts: ["Topic: winter sensitivity", "Context: none"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.violations.some((v) => v.kind === "unverified_stat"), true);
});

test("a stat grounded in a verified proof point passes", () => {
  const r = validateYmyl("Over 2000 smiles treated since 2015!", {
    allowedFacts: ["2000+ patients treated since 2015 (Google profile)"],
  });
  assert.equal(r.violations.filter((v) => v.kind === "unverified_stat").length, 0);
});

test("ungrounded price is blocked; supplied price passes", () => {
  const bad = validateYmyl("Braces starting at just ₹4,999!");
  assert.equal(bad.ok, false);
  assert.equal(bad.violations.some((v) => v.kind === "unverified_price"), true);

  const good = validateYmyl("Braces starting at just ₹4,999!", {
    allowedFacts: ["Offer: braces from ₹4999 this month"],
  });
  assert.equal(good.violations.some((v) => v.kind === "unverified_price"), false);
});

test("banned phrases are caught case-insensitively (floor + profile)", () => {
  const floor = validateYmyl("Experience our 100% Painless treatment today!");
  assert.equal(floor.ok, false);
  assert.equal(floor.violations.some((v) => v.kind === "banned_phrase"), true);

  const profile = validateYmyl("Ghar jaisa mahaul, celebrity smile pakka.", {
    bannedPhrases: ["celebrity smile"],
  });
  assert.equal(profile.ok, false);
});

test("outcome guarantees are caught beyond the phrase list", () => {
  const r = validateYmyl("This treatment will cure your gum disease.");
  assert.equal(r.ok, false);
  assert.equal(r.violations.some((v) => v.kind === "guarantee"), true);
});

test("study citations need a verified source", () => {
  const bad = validateYmyl("Studies show flossing prevents 40% of cavities.");
  assert.equal(bad.violations.some((v) => v.kind === "unverified_citation"), true);
});

test("missing disclaimers are fixable, not blocking; append is idempotent", () => {
  const r = validateYmyl("Chemical peel basics aap ke liye.", {
    requiredDisclaimers: ["Results vary from person to person."],
  });
  assert.equal(r.ok, true); // not a blocking violation
  assert.deepEqual(r.missingDisclaimers, ["Results vary from person to person."]);

  const fixed = appendDisclaimers("Chemical peel basics aap ke liye.", r.missingDisclaimers);
  assert.match(fixed, /Results vary from person to person\.$/);
  const again = validateYmyl(fixed, {
    requiredDisclaimers: ["Results vary from person to person."],
  });
  assert.deepEqual(again.missingDisclaimers, []);
});

test("describeViolations names each violation for the retry prompt", () => {
  const r = validateYmyl("Guaranteed results, 95% success!", { allowedFacts: [] });
  const lines = describeViolations(r.violations);
  assert.equal(lines.length >= 2, true);
  assert.equal(lines.some((l) => /statistic not supplied/.test(l)), true);
});
