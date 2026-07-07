// Deterministic, defensible self-citation matcher for Stage 4 (dependency-free
// .mjs so it runs under `node --test`). Replaces the old "let Claude decide
// self_cited" path, which stored an opaque boolean with no recorded reason.
//
// Rules (per the audit spec):
//   * Match the clinic's FULL name as stored (e.g. "Dr. Mahima's Dental Care").
//     Do NOT strip "Dr." or "Dental Care/Clinic/Centre" — the full name IS the
//     name; over-stripping to a bare "Mahima" would false-positive on unrelated
//     results.
//   * Case- and punctuation-insensitive, tolerating possessive-apostrophe spelling
//     ("Dr. Mahima's" / "Dr. Mahimas" / "Dr Mahima's") — all collapse to the same
//     normalized string, so one containment check covers every spelling.
//   * self_cited is true when the full name appears in the answer TEXT or a source
//     URL/title, OR when the clinic's own website domain appears among the source
//     hosts.
//   * Returns the EXACT string that matched (the stored name, or the domain) so a
//     reader can justify the positive against the stored answer_text beside it.

// Lowercase, drop apostrophes (so possessive variants collapse), turn every other
// non-alphanumeric run into a single space. "Dr. Mahima's Dental Care" and
// "Dr Mahimas  Dental-Care" both become "dr mahimas dental care".
export function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/['’‘`]/g, "") // straight + curly apostrophes, backtick
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hostOf(url) {
  try {
    return new URL(String(url)).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Returns { matched, matchedString, matchedIn }.
//   matchedIn ∈ 'answer_text' | 'source' | 'source_domain' | null
export function matchSelf({ name, websiteUrl, answerText, sources }) {
  const nName = normalize(name);
  if (!nName) return { matched: false, matchedString: null, matchedIn: null };

  // 1) full name in the answer text
  if (normalize(answerText).includes(nName)) {
    return { matched: true, matchedString: name, matchedIn: "answer_text" };
  }

  const srcs = Array.isArray(sources) ? sources : [];

  // 2) full name in a source URL or its title
  for (const s of srcs) {
    const hay = normalize(`${s?.url ?? ""} ${s?.title ?? ""}`);
    if (hay.includes(nName)) {
      return { matched: true, matchedString: name, matchedIn: "source" };
    }
  }

  // 3) clinic's own website domain among the source hosts (name is often absent
  //    from a bare URL string, but the host is unambiguous)
  const host = hostOf(websiteUrl);
  if (host) {
    for (const s of srcs) {
      if (hostOf(s?.url) === host) {
        return { matched: true, matchedString: host, matchedIn: "source_domain" };
      }
    }
  }

  return { matched: false, matchedString: null, matchedIn: null };
}
