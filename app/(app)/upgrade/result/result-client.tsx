"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getPaymentStatus, type PaymentStatus } from "./result-actions";

// Poll our own record (NOT the return redirect) until the webhook marks it paid /
// failed, or we give up after ~30s and tell the user it's still processing.
const POLL_MS = 2500;
const MAX_POLLS = 12; // ~30s

type Phase = "checking" | "paid" | "failed" | "processing";

function phaseFor(status: PaymentStatus): Phase {
  if (status === "paid") return "paid";
  if (status === "failed" || status === "expired") return "failed";
  return "checking";
}

export function ResultClient({ orderId }: { orderId: string | null }) {
  const [phase, setPhase] = useState<Phase>(orderId ? "checking" : "failed");
  const polls = useRef(0);

  const tick = useCallback(async () => {
    const status = await getPaymentStatus(orderId as string);
    const next = phaseFor(status);
    if (next !== "checking") {
      setPhase(next);
      return true; // terminal
    }
    polls.current += 1;
    if (polls.current >= MAX_POLLS) {
      setPhase("processing");
      return true; // stop polling; webhook will finish out-of-band
    }
    return false;
  }, [orderId]);

  useEffect(() => {
    if (!orderId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const run = async () => {
      if (!active) return;
      const done = await tick();
      if (!active || done) return;
      timer = setTimeout(run, POLL_MS);
    };
    run();

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [orderId, tick]);

  const content = VIEWS[orderId ? phase : "failed"];

  return (
    <div className="mt-5 rounded-card border border-border bg-white p-6 shadow-card">
      <div className="flex items-start gap-3">
        {phase === "checking" ? (
          <span
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border border-t-primary"
          />
        ) : (
          <span aria-hidden className={`mt-0.5 text-lg ${content.iconClass}`}>
            {content.icon}
          </span>
        )}
        <div>
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            {content.title}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">{content.body}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {content.primary ? (
          <Link
            href={content.primary.href}
            className="flex h-11 items-center justify-center rounded-button bg-primary px-5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
          >
            {content.primary.label}
          </Link>
        ) : null}
        {content.secondary ? (
          <Link
            href={content.secondary.href}
            className="flex h-11 items-center justify-center rounded-button border border-border bg-white px-5 text-sm font-medium text-text-primary transition-colors hover:bg-subtle"
          >
            {content.secondary.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

type View = {
  icon: string;
  iconClass: string;
  title: string;
  body: string;
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
};

const VIEWS: Record<Phase, View> = {
  checking: {
    icon: "",
    iconClass: "",
    title: "Confirming your payment…",
    body: "This only takes a moment. Please don't close this page.",
  },
  paid: {
    icon: "✓",
    iconClass: "text-success",
    title: "Payment received — activating your account",
    body: "Your plan and credits are being applied. This usually completes within a few seconds.",
    primary: { href: "/", label: "Go to dashboard" },
    secondary: { href: "/upgrade", label: "View plan" },
  },
  failed: {
    icon: "✕",
    iconClass: "text-danger",
    title: "Payment failed or cancelled",
    body: "No charge was completed. You can try again from the plans page.",
    primary: { href: "/upgrade", label: "Try again" },
  },
  processing: {
    icon: "⏳",
    iconClass: "text-warning",
    title: "Payment is processing",
    body: "Your account will activate automatically once the payment is confirmed. Refresh this page in a minute, or check your plan status shortly.",
    primary: { href: "/upgrade", label: "Back to plans" },
  },
};
