"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from "react";

// Reusable guided-tour engine (no tour library — see CLAUDE.md rule 7).
// It spotlights a target element inside `scopeRef`, glides an animated cursor
// to it, and floats a callout with the explanation. Advancement is user-driven:
// click anywhere, press → / Enter, or use the buttons. The same engine can later
// drive an in-app onboarding tour — only the steps + scope element change.

export type TourStep = {
  /** Value of the `data-tour` attribute on the element to spotlight. */
  target: string;
  title: string;
  body: string;
};

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 8; // breathing room around the spotlit element

export function TourOverlay({
  steps,
  index,
  scopeRef,
  onNext,
  onBack,
  onClose,
}: {
  steps: TourStep[];
  index: number;
  scopeRef: RefObject<HTMLElement>;
  onNext: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const measure = useCallback(() => {
    const scope = scopeRef.current;
    if (!scope || !step) return;
    const el = scope.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [scopeRef, step]);

  // Bring the target into view, then keep the spotlight glued to it. The
  // capture-phase scroll listener re-measures during the smooth scroll so the
  // ring + cursor track the element the whole way rather than jumping.
  useLayoutEffect(() => {
    const scope = scopeRef.current;
    const el = scope?.querySelector<HTMLElement>(`[data-tour="${step?.target}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    measure();
    const id = window.setTimeout(measure, 360);
    return () => window.clearTimeout(id);
  }, [index, measure, scopeRef, step]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 639px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      mq.removeEventListener("change", sync);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  // Keyboard: → / Enter advance, ← back, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        onNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onBack();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onBack, onClose]);

  if (!step) return null;

  const hole = rect
    ? {
        top: rect.top - PAD,
        left: rect.left - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null;

  // Cursor points at the centre of the spotlit element. Offset so the pointer's
  // tip (not its top-left corner) lands on the point.
  const cursor = rect
    ? { x: rect.left + rect.width / 2 - 5, y: rect.top + rect.height / 2 - 3 }
    : null;

  // Desktop callout floats just below the target (or above if there's no room);
  // mobile pins it to the bottom as a sheet so it never lands off-screen.
  const calloutStyle: React.CSSProperties | undefined =
    !isMobile && hole
      ? (() => {
          const below = hole.top + hole.height + 14;
          const roomBelow = window.innerHeight - below > 220;
          const width = 340;
          let left = hole.left + hole.width / 2 - width / 2;
          left = Math.max(16, Math.min(left, window.innerWidth - width - 16));
          return roomBelow
            ? { top: below, left, width }
            : {
                top: Math.max(16, hole.top - 14),
                left,
                width,
                transform: "translateY(-100%)",
              };
        })()
      : undefined;

  return (
    <div className="fixed inset-0 z-50">
      {/* Click-catcher — advances the tour from anywhere. */}
      <button
        type="button"
        aria-label="Next step"
        onClick={onNext}
        className="absolute inset-0 h-full w-full cursor-pointer bg-transparent"
      />

      {/* Spotlight — a transparent hole with a huge dimming shadow around it. */}
      {hole ? (
        <div
          className="pointer-events-none absolute rounded-[14px] ring-2 ring-primary transition-all duration-500 ease-out"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px rgba(15,23,23,0.55)",
          }}
        >
          <span className="absolute -inset-1 rounded-[16px] ring-2 ring-primary/40 motion-safe:animate-pulse" />
        </div>
      ) : (
        // No measurable target yet — dim the whole screen so nothing flashes.
        <div className="pointer-events-none absolute inset-0 bg-[rgba(15,23,23,0.55)]" />
      )}

      {/* Animated cursor gliding to the target. */}
      {cursor ? (
        <div
          className="pointer-events-none absolute transition-transform duration-700 ease-in-out motion-reduce:transition-none"
          style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
        >
          <span className="absolute left-0 top-0 h-8 w-8 -translate-x-2 -translate-y-2 rounded-full bg-primary/25 motion-safe:animate-ping" />
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.35)]"
            aria-hidden="true"
          >
            <path
              d="M4 2 L4 17.5 L8.4 13.4 L11 19 L13.4 17.9 L10.8 12.3 L16.5 12 Z"
              fill="#ffffff"
              stroke="#1D1D1F"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : null}

      {/* Callout card. */}
      <div
        className={
          isMobile
            ? "absolute inset-x-3 bottom-3"
            : "absolute rounded-card border border-border bg-white p-5 shadow-card"
        }
        style={calloutStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={
            isMobile
              ? "rounded-card border border-border bg-white p-5 shadow-card"
              : ""
          }
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
              Step {index + 1} of {steps.length}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              Skip
            </button>
          </div>

          <h3 className="mt-2 text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            {step.title}
          </h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-text-secondary">
            {step.body}
          </p>

          <div className="mt-4 flex items-center justify-between gap-3">
            {/* Progress dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={i}
                  className={`h-1.5 rounded-pill transition-all ${
                    i === index
                      ? "w-4 bg-primary"
                      : "w-1.5 bg-border"
                  }`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              {index > 0 ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="min-h-[44px] rounded-button px-3 text-[15px] font-medium text-text-secondary hover:bg-subtle"
                >
                  Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={onNext}
                className="min-h-[44px] rounded-button bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary/90"
              >
                {isLast ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
