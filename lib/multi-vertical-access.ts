import "server-only";

import { parseMultiVerticalFlag } from "./multi-vertical-flag.mjs";

// Global gate for the multi-vertical UI (the "second half" of the vertical
// layer). Server-only so the env var never ships to the browser bundle; screens
// receive the resolved boolean as a prop (the same config→client pattern as
// voice notes). The pure truth-table lives in ./multi-vertical-flag.mjs so it's
// unit-testable; this wrapper just feeds it process.env.

/**
 * Is the multi-vertical experience turned on?
 *
 * DEFAULT **false** — production is dental-only and shows zero vertical UI. The
 * flag must be explicitly enabled (`true`/`1`/`on`/`yes`) to reveal the Vertical
 * dropdowns and the /admin/verticals page. When off, new clinics simply keep the
 * `clinics.vertical` DB default of 'dental'.
 */
export function multiVerticalEnabled(): boolean {
  return parseMultiVerticalFlag(process.env.ENABLE_MULTI_VERTICAL);
}
