// Types for the dependency-free self-citation matcher (self-match.mjs).

export function normalize(s: unknown): string;

export function matchSelf(args: {
  name: string;
  websiteUrl?: string | null;
  answerText?: string | null;
  sources?: { url?: string; title?: string }[] | null;
}): {
  matched: boolean;
  matchedString: string | null;
  matchedIn: "answer_text" | "source" | "source_domain" | null;
};
