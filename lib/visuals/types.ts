// Provider seam for premium AI backgrounds (mirrors lib/serp's adapter idea):
// a provider turns a prompt into PNG/JPEG bytes at roughly the requested size.
// Pricing, prompts, and layout live OUTSIDE the providers, so swapping
// Gemini → FLUX → gpt-image is a registry change, never a feature change.

export type ImageGenOpts = {
  prompt: string;
  width: number;
  height: number;
};

export type ImageProvider = {
  name: string;
  isConfigured(): boolean;
  /** Returns raw image bytes (png or jpeg — satori accepts both as data URIs). */
  generate(opts: ImageGenOpts): Promise<Buffer>;
};
