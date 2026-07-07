export type YmylViolation = {
  kind:
    | "banned_phrase"
    | "guarantee"
    | "unverified_stat"
    | "unverified_price"
    | "unverified_citation";
  detail: string;
};

export type YmylResult = {
  ok: boolean;
  violations: YmylViolation[];
  missingDisclaimers: string[];
};

export const GLOBAL_BANNED_PHRASES: string[];

export function validateYmyl(
  text: string,
  opts?: {
    bannedPhrases?: string[];
    requiredDisclaimers?: string[];
    allowedFacts?: string[];
  },
): YmylResult;

export function appendDisclaimers(
  text: string,
  missingDisclaimers: string[],
): string;

export function describeViolations(violations: YmylViolation[]): string[];

export const GBP_MAX_CHARS: number;
export function gbpSoftWarnings(text: string): string[];
