// Types for the pure JS resolver (lib/vertical.mjs). Kept as a sibling .d.ts so
// the .mjs stays runnable by `node --test` with no build step while TS callers
// (the generate route + page loaders) get full typing.

export const DEFAULT_VERTICAL: string;

export interface WithVertical {
  vertical?: string | null;
}

export function resolveForVertical<T extends WithVertical>(
  rows: T[],
  clinicVertical: string,
  keyOf: (row: T) => string,
): T[];

export function verticalDirective(
  clinicVertical: string,
  displayName: string,
): string;
