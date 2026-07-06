import "server-only";

// Provider-agnostic AI-engine seam (same shape as the billing provider seam):
// the Stage 4 stage only ever talks to AiEngine, never a specific vendor, so a
// new engine (or swapping Perplexity/ChatGPT to direct keys) is a drop-in.

export type AiSource = { url: string; title?: string };

export type AiEngineResponse = {
  present: boolean; // engine produced an answer / an AI Overview was present
  text: string; // answer text ('' when none)
  sources: AiSource[]; // grounded / cited source URLs
};

export interface AiEngine {
  readonly name: string; // 'gemini' | 'perplexity' | 'chatgpt' | 'google_aio'
  isConfigured(): boolean; // false → skipped (missing key), never fails the run
  ask(query: string): Promise<AiEngineResponse>;
}
