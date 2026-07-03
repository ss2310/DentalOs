"use client";

import { useEffect, useRef, useState } from "react";
import { ChatIcon, CloseIcon, SendIcon } from "@/components/icons";

// Floating FAQ help assistant. A bubble bottom-right opens a chat panel that
// answers "how do I use GrowthOS" questions via /api/help (Claude, server-side).
// Available to every signed-in role. Stateless — history lives only in this
// component's state and is sent with each request (the API caps it).

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "How do I message a patient on WhatsApp?",
  "How do I bring my old patients into GrowthOS?",
  "What do credits get used for?",
  "Why can't my receptionist see Settings?",
];

const GREETING: Msg = {
  role: "assistant",
  content:
    "Hi! I'm your GrowthOS help assistant. Ask me how to do anything in the app — messaging patients, recording payments, importing old data, and more.",
};

export function HelpChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Keep the transcript pinned to the latest message.
  useEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, loading, open]);

  // Focus the input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

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
        // Drop the local greeting — it isn't part of the real exchange.
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
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
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close help assistant"
                className="flex h-10 w-10 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
              >
                <CloseIcon />
              </button>
            </div>

            {/* Transcript */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
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

              {/* Suggestion chips (only before the first question) */}
              {messages.length === 1 && !loading ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  {SUGGESTIONS.map((s) => (
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
                placeholder="Ask a question…"
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
