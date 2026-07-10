import "server-only";

import { imageProviderFor } from "./index";
import { premiumTier, type PremiumTier } from "./tiers";
import type { ImageProvider } from "./types";
import { buildVisualPrompt } from "./prompt";

// Shared safe-image core, used by BOTH the Social render route and the Content
// Studio image route. Split into a PRE-SPEND validate step (resolve tier,
// pre-filter the prompt, check the provider is configured) and a POST-SPEND run
// step (build the safety-railed prompt, generate). Credits + storage stay in
// each route — this only owns "is this allowed, and make the pixels".

export type ImageValidation =
  | { ok: true; tier: PremiumTier; provider: ImageProvider }
  | { ok: false; error: string; status: number };

/**
 * PRE-SPEND: resolve the tier and confirm the provider is configured. Call this
 * BEFORE charging credits.
 *
 * NOTE: there is intentionally NO keyword rejection on the description — a
 * customer's wording is never blocked (that only produced frustrating false
 * positives on normal dental copy like "smile"). Output stays safe purely via
 * the SAFETY_BLOCK inside buildVisualPrompt, which instructs the model to render
 * a clean scene with no people/text/clinical content regardless of the wording.
 */
export function validateImageRequest(opts: { tierId: unknown }): ImageValidation {
  const tier = premiumTier(opts.tierId);
  if (!tier) return { ok: false, error: "Pick an image quality.", status: 400 };

  const provider = imageProviderFor(tier.id);
  if (!provider.isConfigured()) {
    return {
      ok: false,
      status: 500,
      error: `${tier.label} isn't available right now — try the free branded image.`,
    };
  }
  return { ok: true, tier, provider };
}

/**
 * POST-SPEND: build the safety-railed prompt and generate one square image.
 * `describe` is the clinic's free-text direction (optional); `subject` is the
 * fallback (post topic / article title). mode 'standalone' = finished post-as-is
 * image; 'backdrop' = a background that gets a text overlay composited on top.
 */
export async function runImageProvider(opts: {
  provider: ImageProvider;
  subject: string;
  describe?: string | null;
  mode?: "standalone" | "backdrop";
  brandPrimary?: string;
}): Promise<Buffer> {
  const describe = String(opts.describe ?? "").trim().slice(0, 300);
  const prompt = buildVisualPrompt({
    topic: describe || opts.subject,
    mode: opts.mode ?? "standalone",
    brandColors: { primary: opts.brandPrimary ?? "#0D9488" },
  });
  return opts.provider.generate({ prompt, width: 1080, height: 1080 });
}
