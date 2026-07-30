// Shared validators used by both client forms and server actions so the
// rules can never drift apart. See CLAUDE.md locale rules (phones +91).

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Canonical form of an email for dedupe / throttling.
 *
 * Lowercases, and for Gmail (incl. googlemail.com) strips dots and +tags in
 * the local part — Gmail ignores both, so `u.n.efeyuni.0.8@gmail.com` and
 * `unefeyuni08+x@gmail.com` are the SAME inbox. Without this one person can
 * mint unlimited "unique" signups from one address (seen in the wild on the
 * clinics list, Jul 2026). Non-Gmail domains are only lowercased — dots are
 * significant there.
 */
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    const plus = local.indexOf("+");
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

/**
 * Normalize an Indian mobile number to its bare 10-digit form.
 *
 * Strips spaces/punctuation, an optional +91 / 91 country code, and leading
 * zeros, then requires exactly 10 digits starting with 6, 7, 8 or 9.
 * Returns the 10-digit string, or null if invalid.
 *
 * The country-code strip only fires when it leaves more than 10 digits, so a
 * genuine number like 9123456789 (starts with "91") is not mangled.
 */
export function normalizeIndianPhone(input: string): string | null {
  let digits = input.replace(/\D/g, "");

  if (digits.length > 10 && digits.startsWith("91")) {
    digits = digits.slice(2);
  }
  digits = digits.replace(/^0+/, "");

  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
