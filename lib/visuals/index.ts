import "server-only";

import { photoImageProvider, studioImageProvider } from "./openrouter";
import { mockImageProvider } from "./mock";
import type { ImageProvider } from "./types";
import type { PremiumTierId } from "./tiers";

// Tier → provider resolution, gated by IMAGE_PROVIDER (same footgun-shaped
// switch as SERP_PROVIDER, documented just as loudly):
//   mock (DEFAULT)              → deterministic gradient for BOTH tiers —
//                                 dev/tests run keyless, output visibly fake.
//   openrouter | live | gemini  → photo tier = Gemini image, studio tier =
//                                 gpt-image-1 — BOTH via the one
//                                 OPENROUTER_API_KEY (one bill, by decision).
// ⚠ PRODUCTION MUST SET IMAGE_PROVIDER=openrouter — default is mock gradients.
const LIVE_VALUES = new Set(["openrouter", "live", "gemini"]);

export function imageProviderFor(tier: PremiumTierId): ImageProvider {
  const setting = (process.env.IMAGE_PROVIDER || "mock").toLowerCase();
  if (!LIVE_VALUES.has(setting)) return mockImageProvider;
  return tier === "studio" ? studioImageProvider : photoImageProvider;
}
