"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChatIcon, CloseIcon, SendIcon } from "@/components/icons";
import {
  sectionForPath,
  sectionsForAudience,
  suggestionsFor,
  HELP_STAGE_ORDER,
  HELP_GREETING,
  HELP_PLACEHOLDER,
  HELP_LANG_LABEL,
  type HelpLang,
} from "@/lib/help-kb";

// Floating FAQ help assistant. A bubble bottom-right opens a chat panel that
// answers "how do I use GrowthOS" questions via /api/help (Claude, server-side).
// Available to every signed-in role. Stateless — history lives only in this
// component's state and is sent with each request (the API caps it).
//
// Page-aware: it detects the screen the user is on and (a) scopes the suggested
// questions to it, (b) sends that section to the API so answers focus there. A
// topic dropdown lets the user ask about a different section on purpose.
//
// Bilingual: when starting a new chat the user picks English or Hinglish. The
// choice is remembered (localStorage), localises the greeting + suggested
// questions, and is sent to the API so the answers come back in that language.

type Msg = { role: "user" | "assistant"; content: string };

const LANG_KEY = "growthos:help-lang";

export function HelpChat({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  // The greeting is rendered separately (so it can localise), so `messages`
  // holds only the real exchange — empty means "new chat, not started yet".
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Topic to scope help to — "" = general. Defaults to the current screen.
  const [topic, setTopic] = useState("");
  // Reply language for this chat. Defaults to English, then to the last choice.
  const [lang, setLang] = useState<HelpLang>("en");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const started = messages.length > 0;

  // Sections this role can reach, grouped by journey stage for the dropdown.
  const sections = useMemo(() => sectionsForAudience(isAdmin), [isAdmin]);
  const groupedSections = useMemo(
    () =>
      HELP_STAGE_ORDER.map((stage) => ({
        stage,
        items: sections.filter((s) => s.stage === stage),
      })).filter((g) => g.items.length > 0),
    [sections],
  );

  const activeSection = topic
    ? sections.find((s) => s.key === topic) ?? null
    : null;
  const suggestions = suggestionsFor(activeSection, lang);

  // Restore the last language choice once, on mount.
  useEffect(() => {
    try {
      if (localStorage.getItem(LANG_KEY) === "hi") setLang("hi");
    } catch {
      // localStorage blocked (private mode) — just keep the default.
    }
  }, []);

  function changeLang(next: HelpLang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
  }

  // Reset to a fresh chat (keeps the remembered language + current topic).
  function newChat() {
    setMessages([]);
    setInput("");
    setError(null);
    inputRef.current?.focus();
  }

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, open]);

  // Focus the input when the panel opens, and default the topic to whatever
  // screen the user is currently on.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const here = sectionForPath(pathname);
    setTopic(here && (isAdmin || here.audience === "all") ? here.key : "");
  }, [open, pathname, isAdmin]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || loading) return;
    setError(null);
    setInput("");

    const next = [...messages, { role: "user" as const, content: question }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/help", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the topic (focus the answer on that screen) and the chat language.
        body: JSON.stringify({
          messages: next,
          section: topic || null,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
      }
    } catch {
      setError("Couldn't reach the assistant. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void send(input);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter makes a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  }

  return (
    <>
      {/* Floating launcher */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open help assistant"
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-pill bg-primary text-white shadow-card transition-transform hover:scale-105 active:scale-95"
        >
          <ChatIcon width={24} height={24} />
        </button>
      ) : null}

      {/* Chat panel */}
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-0 sm:inset-auto sm:bottom-5 sm:right-5">
          {/* Mobile scrim (panel is full-width on phones) */}
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[2px] sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-label="GrowthOS help assistant"
            className="relative z-10 flex h-[85dvh] w-full flex-col overflow-hidden rounded-t-card bg-white shadow-card sm:h-[560px] sm:max-h-[80dvh] sm:w-[380px] sm:rounded-card sm:border sm:border-border"
          >
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-primary/10 text-primary">
                  <ChatIcon width={18} height={18} />
                </span>
                <div>
                  <p className="text-[15px] font-semibold leading-tight text-text-primary">
                    Help Assistant
                  </p>
                  <p className="text-xs leading-tight text-text-secondary">
                    Ask how to use GrowthOS
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {started ? (
                  <button
                    type="button"
                    onClick={newChat}
                    className="min-h-[40px] rounded-button px-2.5 text-sm font-medium text-primary hover:bg-primary/5"
                  >
                    New chat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close help assistant"
                  className="flex h-10 w-10 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>

            {/* Topic scope — defaults to the current screen; the user can pick
                another section to ask about it on purpose. */}
            <div className="flex shrink-0 items-center gap-2 border-b border-border bg-subtle px-4 py-2">
              <label
                htmlFor="help-topic"
                className="text-xs font-medium text-text-secondary"
              >
                Topic
              </label>
              <select
                id="help-topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="min-h-[44px] flex-1 rounded-button border border-border bg-white px-2 text-[13px] text-text-primary outline-none focus:border-primary/50"
              >
                <option value="">General help</option>
                {groupedSections.map((g) => (
                  <optgroup key={g.stage} label={g.stage}>
                    {g.items.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {/* Greeting (always shown, localised) */}
              <div className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-card bg-subtle px-3.5 py-2.5 text-[14px] leading-relaxed text-text-primary">
                  {HELP_GREETING[lang]}
                </div>
              </div>

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-card px-3.5 py-2.5 text-[14px] leading-relaxed ${
                      m.role === "user"
                        ? "bg-primary text-white"
                        : "bg-subtle text-text-primary"
                    }`}
                  >
                    {m.content}
                  </div>
                </div>
              ))}

              {/* Start-of-chat controls: pick a language, then a suggested
                  question. Hidden once the conversation is underway. */}
              {!started && !loading ? (
                <div className="space-y-3 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-text-secondary">
                      Reply in
                    </span>
                    <div className="inline-flex rounded-pill border border-border p-0.5">
                      {(["en", "hi"] as HelpLang[]).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => changeLang(l)}
                          aria-pressed={lang === l}
                          className={`min-h-[44px] rounded-pill px-3.5 text-[13px] font-medium transition-colors ${
                            lang === l
                              ? "bg-primary text-white"
                              : "text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {HELP_LANG_LABEL[l]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-pill border border-border px-3 py-1.5 text-left text-[13px] text-text-secondary transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-card bg-subtle px-3.5 py-2.5 text-[14px] text-text-secondary">
                    <span className="inline-flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-pill bg-text-secondary/60 [animation-delay:-0.2s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-pill bg-text-secondary/60 [animation-delay:-0.1s]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-pill bg-text-secondary/60" />
                    </span>
                  </div>
                </div>
              ) : null}

              {error ? (
                <div className="rounded-card border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-[13px] text-danger">
                  {error}
                </div>
              ) : null}
            </div>

            {/* Composer */}
            <form
              onSubmit={onSubmit}
              className="flex shrink-0 items-end gap-2 border-t border-border px-3 py-3"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                maxLength={2000}
                placeholder={HELP_PLACEHOLDER[lang]}
                className="max-h-28 flex-1 resize-none rounded-button border border-border bg-white px-3 py-2.5 text-[14px] text-text-primary outline-none placeholder:text-text-secondary focus:border-primary/50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button bg-primary text-white transition-opacity disabled:opacity-40"
              >
                <SendIcon width={20} height={20} />
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
