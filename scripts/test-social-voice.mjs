// Unit tests: Brand Personality → prompt context (lib/social/voice.mjs).
// The invariant under test: an UNVERIFIED (sourceless) proof point can NEVER
// reach generation. Run: node --test scripts/test-social-voice.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProofPoint,
  verifiedProofPoints,
  buildVoiceContext,
  buildDefaultProfile,
} from "../lib/social/voice.mjs";

const CLINIC = {
  business_name: "Dr. Mahima's Dental Care",
  doctor_name: "Mahima",
  area: "Vijay Nagar",
  city: "Indore",
  phone: "+91 98260 12345",
};

test("sourceless claims normalize to 'unverified'", () => {
  assert.equal(normalizeProofPoint({ claim: "5000+ patients" }).status, "unverified");
  assert.equal(normalizeProofPoint({ claim: "5000+ patients", source: "  " }).status, "unverified");
  assert.equal(
    normalizeProofPoint({ claim: "5000+ patients", source: "Google reviews count" }).status,
    "verified",
  );
  assert.equal(normalizeProofPoint({ claim: "" }), null);
});

test("unverified proof point NEVER reaches generation (the spec's named test)", () => {
  const profile = {
    identity_line: "Test clinic",
    tone_friendly: 50,
    tone_conversational: 50,
    language_mix: { instagram: "hinglish" },
    banned_phrases: [],
    required_disclaimers: [],
    cta_preference: "whatsapp",
    proof_points: [
      { claim: "10,000 successful implants", source: "" }, // unverified
      { claim: "Rated 4.9 on Google", source: "Google Business Profile" }, // verified
      { claim: "Award-winning clinic", status: "verified" }, // claims verified but has NO source → still filtered
    ],
  };
  const verified = verifiedProofPoints(profile.proof_points);
  assert.equal(verified.length, 1);
  assert.equal(verified[0].claim, "Rated 4.9 on Google");

  const ctx = buildVoiceContext(profile, CLINIC, "instagram");
  assert.equal(ctx.includes("Rated 4.9 on Google"), true);
  assert.equal(ctx.includes("10,000 successful implants"), false);
  assert.equal(ctx.includes("Award-winning clinic"), false);
});

test("no verified facts → explicit no-claims instruction", () => {
  const profile = buildDefaultProfile(CLINIC);
  const ctx = buildVoiceContext(profile, CLINIC, "facebook");
  assert.match(ctx, /make NO numeric or comparative claims/);
});

test("CTA always uses the clinic-record phone, never profile text", () => {
  const profile = buildDefaultProfile(CLINIC);
  const ctx = buildVoiceContext(profile, CLINIC, "instagram");
  assert.equal(ctx.includes(CLINIC.phone), true);
  assert.match(ctx, /WhatsApp/);
});

test("language mix picks the platform's language", () => {
  const profile = buildDefaultProfile(CLINIC);
  assert.match(buildVoiceContext(profile, CLINIC, "instagram"), /Hinglish/);
  assert.match(buildVoiceContext(profile, CLINIC, "gbp"), /English/);
});

test("skip-path default profile is complete enough to generate with", () => {
  const p = buildDefaultProfile(CLINIC, {
    bannedPhrases: ["fairness treatment"],
    disclaimers: ["Results vary."],
  });
  assert.match(p.identity_line, /Dr\. Mahima's Dental Care/);
  assert.match(p.identity_line, /Indore/);
  assert.equal(p.cta_preference, "whatsapp");
  assert.deepEqual(p.banned_phrases, ["fairness treatment"]);
  assert.deepEqual(p.required_disclaimers, ["Results vary."]);
  assert.equal(p.source, "default");
});
