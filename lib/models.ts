// Content Studio model choice — the three AI models a clinic can generate
// with, and what each adds to a post type's credit cost. Pure TS (no
// server/client-only imports) so both the API route and the picker UI use the
// SAME list; pricing changes are a one-line edit here.
//
// Provider split: Claude goes direct through the Anthropic SDK (the original,
// prompt-tuned path). ChatGPT and Gemini go through OpenRouter — the same
// account/key the Deep Audit Stage-4 engines already use (OPENROUTER_API_KEY).
// The OpenRouter slugs can be overridden per-deploy via CONTENT_CHATGPT_MODEL /
// CONTENT_GEMINI_MODEL without a code change.

export type ContentModelId = "claude" | "chatgpt" | "gemini";

export type ContentModel = {
  id: ContentModelId;
  /** Brand name shown in the picker — doctors know these names. */
  label: string;
  vendor: string;
  /** "anthropic" = direct SDK; "openrouter" = OpenAI-compatible chat route. */
  provider: "anthropic" | "openrouter";
  /** Anthropic model id, or the OpenRouter slug. */
  model: string;
  /** Credits ADDED to the post type's base cost when this model is chosen. */
  surcharge: number;
  /** Every prompt template is tuned against this one. */
  recommended?: boolean;
};

export const CONTENT_MODELS: ContentModel[] = [
  {
    id: "claude",
    label: "Claude",
    vendor: "Anthropic",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    // The default stays at base price — only non-tuned models carry surcharges.
    surcharge: 0,
    recommended: true,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    vendor: "OpenAI",
    provider: "openrouter",
    model: "openai/gpt-5.1",
    surcharge: 1,
  },
  {
    id: "gemini",
    label: "Gemini",
    vendor: "Google",
    provider: "openrouter",
    model: "google/gemini-2.5-flash",
    surcharge: 0,
  },
];

export const DEFAULT_CONTENT_MODEL: ContentModelId = "claude";

/** Resolves an untrusted model id to its config (unknown → the default). */
export function contentModel(id: unknown): ContentModel {
  return (
    CONTENT_MODELS.find((m) => m.id === id) ??
    CONTENT_MODELS.find((m) => m.id === DEFAULT_CONTENT_MODEL)!
  );
}

/** Display label for a stored model id (e.g. the /history badge). */
export function contentModelLabel(id: string | null | undefined): string | null {
  const m = CONTENT_MODELS.find((x) => x.id === id);
  return m ? m.label : null;
}
