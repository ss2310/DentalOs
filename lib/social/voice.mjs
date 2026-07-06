// Brand Personality → prompt context. Pure + dependency-free (`node --test`,
// scripts/test-social-voice.mjs). The INVARIANT this module owns: a proof point
// without a source is 'unverified' and NEVER reaches generation — the filter
// lives here, in one function, and everything that builds prompt context goes
// through it.

/** Normalize a raw proof-point entry; sourceless claims are 'unverified'. */
export function normalizeProofPoint(raw) {
  const claim = String(raw?.claim ?? "").trim();
  const source = String(raw?.source ?? "").trim();
  if (!claim) return null;
  return {
    claim,
    source: source || null,
    status: source ? "verified" : "unverified",
  };
}

/** The ONLY path from proof points to prompt text: verified-with-source only. */
export function verifiedProofPoints(proofPoints) {
  return (proofPoints ?? [])
    .map(normalizeProofPoint)
    .filter((p) => p !== null && p.status === "verified" && p.source);
}

function toneWord(value, lowWord, highWord) {
  const v = Number(value ?? 50);
  if (v <= 33) return lowWord;
  if (v >= 67) return highWord;
  return `balanced (between ${lowWord} and ${highWord})`;
}

const LANGUAGE_LABEL = {
  english: "English",
  hindi: "Hindi (Devanagari)",
  hinglish: "natural Hinglish (Hindi flow, English clinical words, Roman script)",
};

/** Human label for a platform's configured language (default English). */
export function languageLabel(profile, platform) {
  const mix = profile?.language_mix ?? {};
  return LANGUAGE_LABEL[mix[platform]] ?? LANGUAGE_LABEL.english;
}

/**
 * Build the "BRAND PERSONALITY" system-prompt block from an active (or default)
 * voice profile. `clinic` supplies the CTA contact — the WhatsApp number always
 * comes from the clinic record, never from profile text.
 */
export function buildVoiceContext(profile, clinic, platform) {
  const lines = ["BRAND PERSONALITY (follow this voice exactly):"];
  if (profile.identity_line) lines.push(`- Identity: ${profile.identity_line}`);
  if (profile.audience) lines.push(`- Audience: ${profile.audience}`);
  lines.push(
    `- Tone: ${toneWord(profile.tone_friendly, "formal", "friendly")}, ` +
      `${toneWord(profile.tone_conversational, "clinical", "conversational")}.`,
  );

  // platform=null → multi-platform call: language directives are given
  // per-platform in the user prompt instead (languageLabel below).
  if (platform) {
    const mix = profile.language_mix ?? {};
    const lang = LANGUAGE_LABEL[mix[platform]] ?? LANGUAGE_LABEL.english;
    lines.push(`- Language for this post: ${lang}.`);
  }

  const cta = profile.cta_preference ?? "whatsapp";
  const phone = String(clinic?.phone ?? "").trim();
  if (cta === "whatsapp") {
    lines.push(
      `- Call to action: invite readers to WhatsApp the clinic${phone ? ` at ${phone}` : ""}.`,
    );
  } else if (cta === "call") {
    lines.push(
      `- Call to action: invite readers to call the clinic${phone ? ` at ${phone}` : ""}.`,
    );
  } else {
    lines.push(`- Call to action: invite readers to walk in / visit the clinic.`);
  }

  const proofs = verifiedProofPoints(profile.proof_points);
  if (proofs.length > 0) {
    lines.push(
      "- You may use ONLY these verified facts (nothing else numeric/claimable):",
    );
    for (const p of proofs) lines.push(`  • ${p.claim} (source: ${p.source})`);
  } else {
    lines.push(
      "- No verified clinic facts were supplied: make NO numeric or comparative claims.",
    );
  }

  const bans = (profile.banned_phrases ?? []).filter(Boolean);
  if (bans.length > 0) {
    lines.push(`- Never use these phrases: ${bans.join("; ")}.`);
  }

  return lines.join("\n");
}

/**
 * Safe default Brand Personality when the wizard was skipped — built from the
 * clinic record + vertical compliance rules, so generation NEVER runs
 * personality-less. Not persisted by this function (the caller may store it
 * with source='default').
 */
export function buildDefaultProfile(clinic, verticalRules = {}) {
  const name = clinic?.business_name ?? "the clinic";
  const doctor = clinic?.doctor_name ? `Dr. ${clinic.doctor_name}` : null;
  const where = [clinic?.area, clinic?.city].filter(Boolean).join(", ");
  return {
    identity_line: [
      name,
      doctor ? `led by ${doctor}` : null,
      where ? `in ${where}` : null,
    ]
      .filter(Boolean)
      .join(", "),
    audience: "local families and working professionals nearby",
    tone_friendly: 60,
    tone_conversational: 55,
    language_mix: { instagram: "hinglish", facebook: "english", gbp: "english" },
    banned_phrases: verticalRules.bannedPhrases ?? [],
    required_disclaimers: verticalRules.disclaimers ?? [],
    cta_preference: "whatsapp",
    proof_points: [],
    source: "default",
  };
}
