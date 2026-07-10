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

export type ContentModelId =
  | "claude"
  | "opus"
  | "chatgpt"
  | "geminipro"
  | "gemini";

export type ContentModel = {
  id: ContentModelId;
  /** Brand name shown in the picker — doctors know these names. */
  label: string;
  vendor: string;
  /** "anthropic" = direct SDK; "openrouter" = OpenAI-compatible chat route. */
  provider: "anthropic" | "openrouter";
  /** Anthropic model id, or the OpenRouter slug. */
  model: string;
  /**
   * Per-deploy slug override env var (OpenRouter models only) — model slugs
   * drift as vendors ship versions, so each is tunable without a code change.
   */
  envVar?: string;
  /** Credits ADDED to the post type's base cost when this model is chosen. */
  surcharge: number;
  /** "premium" = the top-tier upsell models; "standard" = base lineup. */
  tier: "standard" | "premium";
  /** Every prompt template is tuned against this one. */
  recommended?: boolean;
};

// Pricing (approved 10 Jul 2026, migration-047 economics: 1 credit = ₹10 retail,
// ≥60% margin → COGS ≤ ₹4/credit charged). Surcharge = base post cost + this.
// Standard trio first (the everyday choices), premium pair appended.
export const CONTENT_MODELS: ContentModel[] = [
  {
    id: "claude",
    label: "Claude",
    vendor: "Anthropic",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    // The default stays at base price — only non-tuned/premium models surcharge.
    surcharge: 0,
    tier: "standard",
    recommended: true,
  },
  {
    id: "chatgpt",
    label: "ChatGPT",
    vendor: "OpenAI",
    provider: "openrouter",
    model: "openai/gpt-5.1",
    envVar: "CONTENT_CHATGPT_MODEL",
    surcharge: 1,
    tier: "standard",
  },
  {
    id: "gemini",
    label: "Gemini Flash",
    vendor: "Google",
    provider: "openrouter",
    model: "google/gemini-3-flash",
    envVar: "CONTENT_GEMINI_MODEL",
    surcharge: 0,
    tier: "standard",
  },
  {
    id: "opus",
    label: "Claude Opus",
    vendor: "Anthropic",
    provider: "anthropic",
    model: "claude-opus-4-8",
    // Best long-form writer; ~₹22 worst-case COGS on a full Website blog, so
    // +2 (₹20) is the approved flat price (thin margin only on that rare combo,
    // hugely profitable on the 90% of shorter posts).
    surcharge: 2,
    tier: "premium",
  },
  {
    id: "geminipro",
    label: "Gemini 3 Pro",
    vendor: "Google",
    provider: "openrouter",
    model: "google/gemini-3-pro",
    envVar: "CONTENT_GEMINIPRO_MODEL",
    surcharge: 1,
    tier: "premium",
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
