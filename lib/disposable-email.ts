// Disposable / throwaway email domains rejected at signup. Not exhaustive —
// the real gate is the emailed verification code (a disposable inbox CAN pass
// it) — this just cheaply turns away the lazy tier of trial farming. Matching
// covers exact domains and their subdomains.

const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "burnermail.io",
  "byom.de",
  "discard.email",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakeinbox.com",
  "fakemail.net",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "harakirimail.com",
  "inboxkitten.com",
  "linshiyouxiang.net",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mailsac.com",
  "mail-temp.com",
  "mail.tm",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "nada.email",
  "sharklasers.com",
  "spam4.me",
  "spambog.com",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempinbox.com",
  "tempmail.com",
  "tempmail.dev",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "tmpmail.org",
  "trash-mail.com",
  "trashmail.com",
  "yopmail.com",
  "yopmail.fr",
]);

/** True when the address's domain (or a parent domain) is a known throwaway. */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (DISPOSABLE_DOMAINS.has(domain)) return true;
  // Subdomain match: a.b.mailinator.com → mailinator.com
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}
