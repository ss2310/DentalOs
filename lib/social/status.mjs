// Social post status machine — THE one place transitions are defined. Every
// server action that moves a post calls assertTransition first; the DB CHECK
// only bounds the value set. Manual-publish only: there are NO API-publishing
// states. Dependency-free .mjs so it runs under `node --test`
// (scripts/test-social-status.mjs).

export const SOCIAL_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "posted_manually",
  "rejected",
];

// draft → pending_approval → (approved | rejected); approved → posted_manually.
// posted_manually and rejected are terminal.
const ALLOWED = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["posted_manually"],
  posted_manually: [],
  rejected: [],
};

export function canTransition(from, to) {
  return (ALLOWED[from] ?? []).includes(to);
}

/** Throws on an illegal move so a crafted request can never skip approval. */
export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal status transition: ${from} → ${to}`);
  }
}
