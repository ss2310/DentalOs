// Pure parser for the ENABLE_MULTI_VERTICAL flag value — no process.env, no
// server-only import, so it's unit-testable under node:test and can't leak env
// to the client. lib/multi-vertical-access.ts (server-only) is the thin wrapper
// that feeds process.env.ENABLE_MULTI_VERTICAL through this. Types: .d.ts sibling.

/**
 * Is the given raw flag value "on"? DEFAULT OFF — only an explicit
 * true/1/on/yes (case/space-insensitive) enables it. Everything else — unset,
 * empty, false/0/off/no, garbage — is off.
 */
export function parseMultiVerticalFlag(raw) {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "on" || v === "yes";
}
