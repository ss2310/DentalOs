import { normalizeIndianPhone } from "./validation";

// wa.me deep links (see CLAUDE.md rule 3). All patient messaging goes through
// these — no WhatsApp Business API.

/** Returns the wa.me number form "91XXXXXXXXXX" for an Indian mobile. */
export function waNumber(raw: string): string {
  const n = normalizeIndianPhone(raw);
  return n ? `91${n}` : raw.replace(/\D/g, "");
}

/**
 * Builds a wa.me deep link. The message is passed through encodeURIComponent,
 * which safely escapes apostrophes, emoji, newlines (→ %0A), and any other
 * special characters a patient name or message might contain.
 */
export function waLink(rawNumber: string, message: string): string {
  return `https://wa.me/${waNumber(rawNumber)}?text=${encodeURIComponent(message)}`;
}
