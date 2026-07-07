"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "@/components/icons";

/**
 * Centered modal dialog. Parent owns the `open` state. Closes on Escape and
 * backdrop click. Mobile-first: full-width on small screens, capped on larger.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  // Render into <body> via a portal so `position: fixed` resolves against the
  // viewport. Rendered in place, the modal would be a descendant of the header's
  // `backdrop-blur` (backdrop-filter), which becomes the containing block for
  // fixed descendants and clips the modal's top (heading) off-screen.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Flex column so the header stays pinned while only the body scrolls.
          Capped with dynamic viewport height (dvh) so mobile browser chrome
          can never push the modal — or its bottom action — off screen. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-card bg-white shadow-card sm:max-h-[calc(100dvh_-_2rem)] sm:max-w-lg sm:rounded-card"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-white/90 px-5 py-4 backdrop-blur-sm">
          <h2 className="text-lg font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-button text-text-secondary hover:bg-subtle"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
