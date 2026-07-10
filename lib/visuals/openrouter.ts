import "server-only";

import type { ImageProvider } from "./types";

// BOTH premium tiers run through the ONE OpenRouter key the audit engines and
// Content Studio text models already bill against (user decision 07 Jul 2026:
// one platform bill beats per-vendor keys, 5% commission included). OpenRouter
// exposes image generation via chat completions with the image modality; the
// image comes back as a data URI in message.images. Slugs are env-tunable
// because image-model churn is fast.
const OR_IMAGE_TIMEOUT_MS = 100_000; // route maxDuration 120s − render/upload headroom

type ORImageResp = {
  choices?: Array<{
    message?: {
      images?: Array<{ image_url?: { url?: string } }>;
    };
  }>;
  error?: { message?: string; code?: number };
};

export function createOpenRouterImageProvider(
  name: string,
  defaultModel: string,
  modelEnvVar: string,
): ImageProvider {
  return {
    name,
    isConfigured: () => !!process.env.OPENROUTER_API_KEY,
    async generate({ prompt, width, height }) {
      const key = process.env.OPENROUTER_API_KEY;
      if (!key) throw new Error("OPENROUTER_API_KEY is not set");
      const base =
        process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
      const model = process.env[modelEnvVar] || defaultModel;

      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          "HTTP-Referer":
            process.env.NEXT_PUBLIC_APP_URL || "https://growthos.app",
          "X-Title": "GrowthOS Premium Visuals",
        },
        body: JSON.stringify({
          model,
          modalities: ["image", "text"],
          messages: [
            {
              role: "user",
              // The size hint travels in the prompt; image chat models don't
              // take width/height params. The renderer cover-fits either way,
              // so near-square output is fine.
              content: `${prompt}\n\nOutput size: ${width}x${height} (square).`,
            },
          ],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(OR_IMAGE_TIMEOUT_MS),
      });
      if (!res.ok) {
        throw new Error(`OpenRouter image (${model}) failed (${res.status})`);
      }

      const data = (await res.json()) as ORImageResp;
      if (data.error) {
        throw new Error(
          `OpenRouter image error: ${data.error.message ?? "unknown"}`,
        );
      }
      const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
      const m = url.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
      if (!m) throw new Error("OpenRouter returned no image data");
      return Buffer.from(m[1], "base64");
    },
  };
}

// Defaults probed live 07 Jul 2026 (latency must fit the 120s route budget):
//   gemini-3.1-flash-image ~12s ✓   gemini-3-pro-image ~23s ✓
//   openai/gpt-5-image ~52s (tight — available via IMAGE_STUDIO_MODEL)
//   openai/gpt-5.4-image-2 ~169s ✗ over budget, do not default to it

/** Photo backdrop tier — Gemini flash image via OpenRouter. */
export const photoImageProvider = createOpenRouterImageProvider(
  "openrouter:gemini-flash-image",
  "google/gemini-3.1-flash-image",
  "IMAGE_MODEL",
);

/** Studio tier — Gemini 3 Pro image via OpenRouter. */
export const studioImageProvider = createOpenRouterImageProvider(
  "openrouter:gemini-pro-image",
  "google/gemini-3-pro-image",
  "IMAGE_STUDIO_MODEL",
);

/**
 * Studio Pro (top) tier — GPT-Image via OpenRouter. Best quality; ~52s latency
 * runs tight under the 120s render route budget, so it defaults to the fast
 * gpt-5-image slug. Do NOT point IMAGE_STUDIOPRO_MODEL at the ~169s variant —
 * it exceeds the route timeout (see latency notes above).
 */
export const studioProImageProvider = createOpenRouterImageProvider(
  "openrouter:gpt-image",
  "openai/gpt-5-image",
  "IMAGE_STUDIOPRO_MODEL",
);
