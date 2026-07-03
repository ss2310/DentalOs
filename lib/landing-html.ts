// Pure helpers that turn a generated "Geo Landing Page" (plain-text copy + its
// JSON-LD) into a complete, self-contained HTML document we can host at
// /p/<booking_slug>/<slug>. No server/client-only imports, so it's usable from
// the publish action and unit-testable.
//
// Hosted landing pages are subdomain-hosted v1; custom-domain mapping is a
// future feature and is intentionally not handled here.

export type LandingClinic = {
  business_name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  area: string | null;
  booking_slug: string | null;
};

export type BuildLandingInput = {
  title: string;
  metaDescription: string;
  bodyHtml: string;
  schemaJsonLd: string | null;
  clinic: LandingClinic;
};

/** Lowercase-hyphen slug: letters/digits only, collapsed dashes, trimmed. */
export function slugify(input: string): string {
  return (input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 60);
}

/** Keeps only digits and prefixes 91 for a bare 10-digit Indian mobile. */
export function normalizePhone(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.length === 10 ? `91${digits}` : digits;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Escape text, then re-enable **bold** as <strong>.
function inline(s: string): string {
  return escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

/**
 * Pulls "META TITLE:" / "META DESCRIPTION:" labelled lines out of the copy and
 * returns them plus the remaining body (with those lines + any PART/schema
 * markers removed). Falls back to a sensible title if the label is absent.
 */
export function parseMeta(
  copy: string,
  fallbackTitle: string,
): { title: string; description: string; body: string } {
  const titleMatch = copy.match(/^[ \t>*#-]*META TITLE:[ \t]*(.+)$/im);
  const descMatch = copy.match(/^[ \t>*#-]*META DESCRIPTION:[ \t]*(.+)$/im);

  const body = copy
    .replace(/^[ \t>*#-]*META TITLE:[ \t]*.+$/im, "")
    .replace(/^[ \t>*#-]*META DESCRIPTION:[ \t]*.+$/im, "")
    // Strip any leftover section markers so they don't render as body text.
    .replace(/^[ \t>*#-]*part[ \t]*[ab]\b.*$/gim, "")
    .replace(/^[ \t>*#-]*seo schema\b.*$/gim, "")
    .trim();

  return {
    title: (titleMatch?.[1] ?? fallbackTitle).trim(),
    description: (descMatch?.[1] ?? "").trim(),
    body,
  };
}

/**
 * Heuristic plain-text → semantic HTML. Handles markdown headings (`#`..`###`)
 * and "H1:".."H3:" labels, `- `/`* ` bullet lists, **bold**, and blank-line
 * separated paragraphs. Everything is HTML-escaped first (AI text is untrusted).
 */
export function copyToHtml(body: string): string {
  const lines = body.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      out.push(`<ul>${list.map((li) => `<li>${inline(li)}</li>`).join("")}</ul>`);
      list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushList();
      continue;
    }

    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushPara();
      flushList();
      const lvl = Math.min(m[1].length, 3);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = line.match(/^H([1-3])[:.)]\s*(.+)$/i))) {
      flushPara();
      flushList();
      const lvl = Number(m[1]);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = line.match(/^\*\*(.+?)\*\*:?$/))) {
      // A whole line wrapped in ** reads as a subheading.
      flushPara();
      flushList();
      out.push(`<h2>${inline(m[1])}</h2>`);
    } else if ((m = line.match(/^[-*•]\s+(.+)$/))) {
      flushPara();
      list.push(m[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return out.join("\n");
}

// Self-contained styles: Inter (with a safe system fallback), our design tokens,
// mobile-first, ≥44px tap targets. Kept minimal and inlined so the page has no
// hard dependency on our app CSS.
const STYLES = `
:root{--teal:#0D9488;--ink:#0B2E2B;--mint:#2DD4BF;--text:#0F172A;--muted:#64748B;--border:#E2E8F0;--subtle:#F5F9F8}
*{box-sizing:border-box}
body{margin:0;font-family:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--text);line-height:1.6;background:#fff;-webkit-text-size-adjust:100%;padding-bottom:72px}
header.site{background:var(--ink);color:#fff;padding:16px 20px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
header.site .name{font-weight:600;font-size:18px}
header.site .loc{color:var(--mint);font-size:14px}
header.site a.phone{color:#fff;text-decoration:none;font-weight:600;min-height:44px;display:inline-flex;align-items:center}
main{max-width:760px;margin:0 auto;padding:24px 20px 8px}
article h1{font-size:28px;line-height:1.25;margin:8px 0 16px}
article h2{font-size:21px;margin:28px 0 10px}
article h3{font-size:17px;margin:22px 0 8px}
article p{margin:0 0 14px}
article ul{margin:0 0 16px;padding-left:22px}
article li{margin:6px 0}
.book{margin:28px 0 8px}
a.btn-book{display:inline-flex;align-items:center;justify-content:center;background:var(--teal);color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:0 22px;min-height:48px;border-radius:10px}
footer.site{border-top:1px solid var(--border);background:var(--subtle);color:var(--muted);font-size:14px;padding:24px 20px;margin-top:24px}
footer.site .name{color:var(--text);font-weight:600;font-size:15px}
footer.site a{color:var(--teal);text-decoration:none}
.callbar{position:fixed;left:0;right:0;bottom:0;background:var(--teal);color:#fff;text-align:center;text-decoration:none;font-weight:600;font-size:16px;min-height:56px;display:flex;align-items:center;justify-content:center;box-shadow:0 -1px 8px rgba(0,0,0,.08)}
`.trim();

/**
 * Assembles the full standalone HTML document: <head> meta (title/description),
 * inline styles, header + footer with clinic NAP, the converted body, a
 * "Book Appointment" CTA (→ /book/<booking_slug> if set, else a wa.me link), a
 * sticky "Call Now" tel: bar, and the JSON-LD in a <script> tag.
 */
export function buildLandingPageHtml(input: BuildLandingInput): string {
  const { clinic } = input;
  const name = clinic.business_name ?? "Our Clinic";
  const phoneDigits = normalizePhone(clinic.phone);
  const locBits = [clinic.area, clinic.city].filter(Boolean).join(", ");

  // Book CTA: hosted booking page if the clinic has a public slug, else WhatsApp.
  const bookMsg = `Hi, I'd like to book an appointment at ${name}.`;
  const bookHref = clinic.booking_slug
    ? `/book/${clinic.booking_slug}`
    : phoneDigits
      ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(bookMsg)}`
      : "#";

  const callHref = phoneDigits ? `tel:+${phoneDigits}` : "#";
  const phoneLabel = clinic.phone ?? "";

  // Guard the JSON-LD so a literal "</script>" inside it can't close the tag.
  const schemaBlock =
    input.schemaJsonLd && input.schemaJsonLd.trim()
      ? `\n<script type="application/ld+json">${input.schemaJsonLd
          .trim()
          .replace(/<\/(script)/gi, "<\\/$1")}</script>`
      : "";

  const headerLoc = locBits ? `<span class="loc">${escapeHtml(locBits)}</span>` : "";
  const headerPhone = phoneDigits
    ? `<a class="phone" href="${callHref}">📞 ${escapeHtml(phoneLabel)}</a>`
    : "";

  const footerAddress = clinic.address
    ? `<p>${escapeHtml(clinic.address)}</p>`
    : "";
  const footerPhone = phoneDigits
    ? `<p><a href="${callHref}">📞 ${escapeHtml(phoneLabel)}</a></p>`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title)}</title>
<meta name="description" content="${escapeHtml(input.metaDescription)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${STYLES}</style>
</head>
<body>
<header class="site">
<div><span class="name">${escapeHtml(name)}</span> ${headerLoc}</div>
${headerPhone}
</header>
<main>
<article>
${input.bodyHtml}
</article>
<div class="book"><a class="btn-book" href="${bookHref}">Book Appointment</a></div>
</main>
<footer class="site">
<p class="name">${escapeHtml(name)}</p>
${footerAddress}
${footerPhone}
</footer>
<a class="callbar" href="${callHref}">📞 Call Now</a>${schemaBlock}
</body>
</html>`;
}
