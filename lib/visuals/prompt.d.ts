export const SAFETY_BLOCK: string;

export function buildVisualPrompt(opts: {
  topic?: string | null;
  campaignType?: string | null;
  season?: string | null;
  brandColors: { primary: string; secondary?: string };
}): string;
