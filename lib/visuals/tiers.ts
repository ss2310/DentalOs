// Premium visual tiers for the Social Content Engine — pure TS (no server
// imports) so the review/publish UI and the render route share ONE price list.
// Free branded template renders are NOT a tier — they stay zero-credit and are
// never called "basic" in UI copy (they're "branded"; premium is a "photo
// backdrop"). Pricing decided 07 Jul 2026: photo +1/+3, studio +2/+5.

export type PremiumTierId = "photo" | "studio";

export type PremiumTier = {
  id: PremiumTierId;
  /** UI label — describes the outcome, not the vendor. */
  label: string;
  /** Credits for a single-image post. */
  singleCredits: number;
  /** Credits for a 6-slide carousel (ONE background reused across slides). */
  carouselCredits: number;
};

export const PREMIUM_TIERS: PremiumTier[] = [
  { id: "photo", label: "Photo backdrop", singleCredits: 1, carouselCredits: 3 },
  { id: "studio", label: "Studio photo", singleCredits: 2, carouselCredits: 5 },
];

/** Resolves an untrusted tier id (null for anything unknown — free render). */
export function premiumTier(id: unknown): PremiumTier | null {
  return PREMIUM_TIERS.find((t) => t.id === id) ?? null;
}

export function tierCost(tier: PremiumTier, format: string): number {
  return format === "carousel" ? tier.carouselCredits : tier.singleCredits;
}
