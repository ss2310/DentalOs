// Instagram hashtag shaping — EXACTLY five, mixing locality + service (models
// can't count reliably, so the guarantee lives in code). Pure + dependency-free
// (`node --test`, covered in scripts/test-social-ymyl.mjs).

function toTag(raw) {
  const cleaned = String(raw ?? "")
    .replace(/^#/, "")
    .replace(/[^A-Za-z0-9_]/g, "");
  return cleaned ? `#${cleaned}` : null;
}

/**
 * Normalize the model's suggestions to exactly 5 unique hashtags. Shortfall is
 * padded from locality (area/city), the service/topic words, and the clinic
 * name — in that order — then neutral fillers, so the mix stays local+service.
 */
export function exactlyFiveHashtags(suggested, { area, city, topic, clinicName } = {}) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    const tag = toTag(raw);
    if (tag && !seen.has(tag.toLowerCase()) && out.length < 5) {
      seen.add(tag.toLowerCase());
      out.push(tag);
    }
  };

  for (const s of suggested ?? []) push(s);

  const topicWords = String(topic ?? "")
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length >= 4);
  const pool = [
    area && city ? `${area}${city}` : null,
    area,
    city,
    topicWords.slice(0, 2).join(""),
    topicWords[0],
    clinicName,
    city ? `${city}Clinic` : null,
    "NearYou",
    "BookNow",
    "LocalClinic",
    "HealthTips",
    "ClinicCare",
  ];
  for (const p of pool) {
    if (out.length >= 5) break;
    push(p);
  }
  return out;
}
