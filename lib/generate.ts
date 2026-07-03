// Shared types + helpers for the /generate Content Studio.
// Pure TS (no server/client-only imports) so both the API route and the
// client UI can use it.

export type ExtraInput = {
  name: string;
  label: string;
  type: "text" | "textarea" | "select";
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

export type TopicConfig = {
  show?: boolean; // default true
  required?: boolean; // default true when shown
  label?: string;
  placeholder?: string;
};

export type ExtraFields = {
  topic?: TopicConfig;
  inputs?: ExtraInput[];
};

export type PostType = {
  id: string;
  name: string;
  platform: string;
  credits_cost: number;
  schema_template: string | null;
  extra_fields: ExtraFields | null;
  // Which topic_suggestions bank feeds this type's Topic dropdown (migration
  // 012). null / undefined = no suggestions (free-text topic only).
  topic_bank?: string | null;
};

export const TONES = ["Professional", "Friendly", "Warm"] as const;
export type Tone = (typeof TONES)[number];

// Platform badge tints (design tokens + a couple of Tailwind palette colors).
export const PLATFORM_BADGE: Record<string, string> = {
  "Google Business": "bg-primary/10 text-primary",
  Instagram: "bg-pink-100 text-pink-700",
  Website: "bg-teal-100 text-teal-700",
  "Google Reviews": "bg-warning/10 text-warning",
  WhatsApp: "bg-success/10 text-success",
};

export function platformBadge(platform: string): string {
  return PLATFORM_BADGE[platform] ?? "bg-subtle text-text-secondary";
}

/** Replaces {{variable}} placeholders with values (missing → empty string). */
export function fillTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// --- Generation post-processing -------------------------------------------
// Models can't count characters reliably, so we enforce the hard limits in
// code after generation (see the spec's cheat-sheet).

/** Web types that emit an inline JSON-LD schema block ("PART B — SCHEMA").
 *  Note: in AI-Citable mode the route also splits schema for any Website type,
 *  since the citable block instructs schema emission for all of them. */
export const SCHEMA_TYPES = new Set([
  "Service Page",
  "Geo Landing Page",
  "Blog Article with FAQ",
  "City Dental Stats",
  "Treatment Comparison",
  "Clinician Guide (YMYL)",
  "Dental Update / What's New",
  "Question Answer Page",
]);

/** Trims a string to `max` chars on a word boundary (no mid-word cuts). */
export function trimOnWordBoundary(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * Enforces the hard character limits: META TITLE ≤60, META DESCRIPTION ≤155
 * (labelled lines, trimmed in place), GBP body ≤1,400, IG caption ≤2,200.
 */
export function enforceLimits(name: string, content: string): string {
  let out = content;
  out = out.replace(
    /^([ \t>*#-]*META TITLE:[ \t]*)(.+)$/im,
    (_m, p: string, v: string) => p + trimOnWordBoundary(v, 60),
  );
  out = out.replace(
    /^([ \t>*#-]*META DESCRIPTION:[ \t]*)(.+)$/im,
    (_m, p: string, v: string) => p + trimOnWordBoundary(v, 155),
  );
  if (name === "GBP Post") out = trimOnWordBoundary(out, 1400);
  if (name === "Instagram Caption") out = trimOnWordBoundary(out, 2200);
  return out;
}

/**
 * Splits inline "PART B — SCHEMA" / "SEO Schema" JSON-LD out of a web page's
 * copy so the UI can show it in its own collapsible block. Returns the copy
 * (main) and the schema (or null if no schema marker is present).
 */
export function splitSchema(content: string): {
  main: string;
  schema: string | null;
} {
  const m = content.match(/^[ \t>*#-]*(part[ \t]*b\b.*|seo schema\b.*)$/im);
  if (!m || m.index === undefined) return { main: content.trim(), schema: null };

  const before = content.slice(0, m.index).trim();
  let after = content.slice(m.index).replace(/^[^\n]*\n?/, ""); // drop heading line
  after = after
    .trim()
    .replace(/^```[a-z]*[ \t]*\n?/i, "")
    .replace(/```[ \t]*$/i, "")
    .trim();

  // Drop an echoed "PART A" label from the copy if present.
  const main = before.replace(/^[ \t>*#-]*part[ \t]*a\b.*$/im, "").trim();
  return { main: main || before, schema: after || null };
}

/** Pulls the human-readable message out of a WhatsApp broadcast result. */
export function extractWhatsAppMessage(content: string): string {
  const m = content.match(/MESSAGE:[ \t]*\n?([\s\S]*?)(?:\n[ \t>*#-]*WA_ENCODED:|$)/i);
  return (m ? m[1] : content).trim();
}
