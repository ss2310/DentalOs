import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  buildHelpSystemPrompt,
  HELP_SECTIONS,
  HELP_LANG_DIRECTIVE,
  toHelpLang,
} from "@/lib/help-kb";

// Build the (large, identical-every-call) KB prompt once per server process, not
// per request. Kept server-side only — never shipped to the client bundle.
const HELP_SYSTEM_PROMPT = buildHelpSystemPrompt();

// The Anthropic SDK requires the Node runtime. The API key is read from
// ANTHROPIC_API_KEY on the server and is NEVER exposed to the client.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Haiku 4.5: ~3x cheaper than Sonnet ($1/$5 vs $3/$15 per Mtok) and plenty
// capable for grounded FAQ answers. Marketing generation stays on Sonnet.
const MODEL = "claude-haiku-4-5";

// Abuse caps. The help chat is FREE (no credits), so bound it hard instead:
// short replies, a short rolling history, and per-message length limits so a
// crafted request can't turn this into an unbounded-token cost sink (mirrors
// the SEC-H2 finding on the generate route).
const MAX_TOKENS = 700;
const MAX_HISTORY = 12; // messages kept from the client (older ones dropped)
const MAX_MSG_CHARS = 2000; // per message
const MAX_TOTAL_CHARS = 12000; // across the whole conversation

type ChatMessage = { role: "user" | "assistant"; content: string };

function sanitizeHistory(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const cleaned: ChatMessage[] = [];
  for (const m of input) {
    if (!m || typeof m !== "object") continue;
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string") continue;
    const trimmed = content.trim().slice(0, MAX_MSG_CHARS);
    if (!trimmed) continue;
    cleaned.push({ role, content: trimmed });
  }
  // Keep only the most recent turns, and cap total characters from newest back.
  const recent = cleaned.slice(-MAX_HISTORY);
  let total = 0;
  const bounded: ChatMessage[] = [];
  for (let i = recent.length - 1; i >= 0; i--) {
    total += recent[i].content.length;
    if (total > MAX_TOTAL_CHARS) break;
    bounded.unshift(recent[i]);
  }
  return bounded;
}

export async function POST(req: Request) {
  let body: { messages?: unknown; section?: unknown; lang?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Auth required (any signed-in role — help is for everyone).
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const messages = sanitizeHistory(body.messages);
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "Please type a question." },
      { status: 400 },
    );
  }

  // Page-aware context: the client sends the section key of the screen the user
  // is on. Validate it against the known sections (never trust the raw string —
  // it's echoed into the prompt) so it can't be used to inject instructions.
  const section =
    typeof body.section === "string"
      ? HELP_SECTIONS.find((s) => s.key === body.section) ?? null
      : null;

  // Reply language the user picked for this chat (validated; defaults to en).
  const lang = toHelpLang(body.lang);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Help chat is not configured on the server yet." },
      { status: 500 },
    );
  }

  try {
    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    // Cache the (identical every call) knowledge base as a prompt-cache prefix.
    // The cache breakpoint sits on the KB block; the small per-request "current
    // screen" block comes AFTER it (uncached, tiny) so it never invalidates the
    // cached KB, and the volatile user messages come after that.
    const system: Anthropic.TextBlockParam[] = [
      {
        type: "text",
        text: HELP_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ];
    if (section) {
      system.push({
        type: "text",
        text: `CURRENT SCREEN: The user is on the "${section.label}" screen (${section.summary}). If their question is general or clearly about this screen, focus your answer there; otherwise answer what they actually asked.`,
      });
    }
    const langDirective = HELP_LANG_DIRECTIVE[lang];
    if (langDirective) {
      system.push({ type: "text", text: langDirective });
    }

    const message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages,
    });

    const reply = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!reply) {
      return NextResponse.json(
        { error: "No answer came back. Please try rephrasing." },
        { status: 502 },
      );
    }

    return NextResponse.json({ reply });
  } catch (err) {
    // Friendly, retryable message. Log the real error server-side only.
    console.error("Help chat failed:", err);
    const status = err instanceof Anthropic.APIError ? err.status ?? 502 : 502;
    const message =
      status === 429
        ? "The assistant is busy right now. Please wait a moment and try again."
        : "Something went wrong. Please try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
