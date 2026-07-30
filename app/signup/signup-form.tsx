"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState, useTransition } from "react";
import { useFormState } from "react-dom";
import {
  sendSignupCodeAction,
  signUpAction,
  type SignupState,
} from "./actions";
import { SubmitButton } from "@/components/submit-button";
import { isValidEmail, normalizeIndianPhone } from "@/lib/validation";

const initialState: SignupState = {};

const baseInputClass =
  "h-11 w-full rounded-button border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-2";
const okInputClass =
  "border-border focus:border-primary focus:ring-primary/20";
const errInputClass = "border-danger focus:border-danger focus:ring-danger/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";
const fieldErrClass = "mt-1 text-sm text-danger";

// Cloudflare Turnstile renders only when the site key is configured
// (build-inlined NEXT_PUBLIC_ var — redeploy without cache after setting it).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
        },
      ) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

export function SignupForm({
  verticals = null,
}: {
  // Non-null only when ENABLE_MULTI_VERTICAL is on (the page decides). Null ⇒ no
  // vertical dropdown, exactly as production looks today.
  verticals?: { id: string; display_name: string }[] | null;
}) {
  const [state, formAction] = useFormState(signUpAction, initialState);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Verification-code phase (SEC: anti-bot signup). "idle" = collecting
  // fields; "sent" = code emailed, input shown. When migration 055 isn't
  // applied the send action answers "skip" and the form submits directly
  // (the server accepts codeless signups only in that state).
  const [codePhase, setCodePhase] = useState<"idle" | "sent">("idle");
  const [codeValue, setCodeValue] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const [sending, startSending] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  // Turnstile widget state. The token is single-use — consumed by the
  // send-code action, then the widget is reset for a potential resend.
  const turnstileRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  function mountTurnstile() {
    if (!TURNSTILE_SITE_KEY || !turnstileRef.current || !window.turnstile) {
      return;
    }
    if (widgetIdRef.current !== null) return;
    widgetIdRef.current = window.turnstile.render(turnstileRef.current, {
      sitekey: TURNSTILE_SITE_KEY,
      callback: (token) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(null),
    });
  }

  // The script may already be loaded when this component mounts (client-side
  // navigation) — next/script won't re-fire onLoad in that case.
  useEffect(() => {
    mountTurnstile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resendWait <= 0) return;
    const t = setInterval(() => setResendWait((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendWait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const emailOk = isValidEmail(email);
  const phoneOk = normalizeIndianPhone(phone) !== null;

  const emailError =
    emailTouched && !emailOk
      ? email.trim()
        ? "Enter a valid email address."
        : "Email is required."
      : null;
  const phoneError =
    phoneTouched && !phoneOk
      ? phone.trim()
        ? "Enter a valid 10-digit Indian mobile number."
        : "Phone is required."
      : null;

  function inputClass(hasError: boolean) {
    return `${baseInputClass} ${hasError ? errInputClass : okInputClass}`;
  }

  function resetTurnstile() {
    setTurnstileToken(null);
    if (widgetIdRef.current !== null) {
      window.turnstile?.reset(widgetIdRef.current);
    }
  }

  function sendCode() {
    setSendError(null);
    startSending(async () => {
      try {
        const res = await sendSignupCodeAction({
          email,
          turnstileToken,
        });
        if (res.status === "sent") {
          setCodePhase("sent");
          setResendWait(45);
          resetTurnstile();
        } else if (res.status === "skip") {
          // Code gate not armed yet (migration pending) — submit directly.
          formRef.current?.requestSubmit();
        } else {
          setSendError(res.error);
          resetTurnstile();
        }
      } catch {
        setSendError("Something went wrong. Please try again.");
      }
    });
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      {sendError ? (
        <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {sendError}
        </p>
      ) : null}

      <div>
        <label htmlFor="clinicName" className={labelClass}>
          Clinic name
        </label>
        <input
          id="clinicName"
          name="clinicName"
          type="text"
          required
          className={inputClass(false)}
          placeholder="Your clinic's name"
        />
      </div>

      <div>
        <label htmlFor="doctorName" className={labelClass}>
          Doctor name
        </label>
        <input
          id="doctorName"
          name="doctorName"
          type="text"
          required
          className={inputClass(false)}
          placeholder="Dr. Priya Sharma"
        />
      </div>

      {verticals && verticals.length > 0 ? (
        <div>
          <label htmlFor="vertical" className={labelClass}>
            Clinic type
          </label>
          <select
            id="vertical"
            name="vertical"
            defaultValue={
              verticals.some((v) => v.id === "dental") ? "dental" : verticals[0].id
            }
            className={`${baseInputClass} ${okInputClass} bg-white`}
          >
            {verticals.map((v) => (
              <option key={v.id} value={v.id}>
                {v.display_name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            // Changing the address invalidates an already-sent code.
            if (codePhase === "sent") {
              setCodePhase("idle");
              setCodeValue("");
            }
          }}
          onBlur={() => setEmailTouched(true)}
          aria-invalid={emailError ? true : undefined}
          className={inputClass(!!emailError)}
          placeholder="you@clinic.com"
        />
        {emailError ? <p className={fieldErrClass}>{emailError}</p> : null}
      </div>

      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass(false)}
          placeholder="At least 8 characters"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="phone" className={labelClass}>
            Phone
          </label>
          <input
            id="phone"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onBlur={() => setPhoneTouched(true)}
            aria-invalid={phoneError ? true : undefined}
            className={inputClass(!!phoneError)}
            placeholder="98XXXXXXXX"
          />
          {phoneError ? <p className={fieldErrClass}>{phoneError}</p> : null}
        </div>
        <div>
          <label htmlFor="city" className={labelClass}>
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            className={inputClass(false)}
            placeholder="Mumbai"
          />
        </div>
      </div>

      {TURNSTILE_SITE_KEY ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/api.js?render=explicit"
            onLoad={mountTurnstile}
          />
          <div ref={turnstileRef} className="flex justify-center" />
        </>
      ) : null}

      {codePhase === "idle" ? (
        <button
          type="button"
          onClick={sendCode}
          disabled={!emailOk || !phoneOk || sending}
          className="h-11 w-full rounded-button bg-primary text-[15px] font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Sending code…" : "Email me a verification code"}
        </button>
      ) : (
        <>
          <div>
            <label htmlFor="code" className={labelClass}>
              Verification code
            </label>
            <input
              id="code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={codeValue}
              onChange={(e) =>
                setCodeValue(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className={`${inputClass(false)} text-center text-lg tracking-[0.5em]`}
              placeholder="••••••"
            />
            <p className="mt-1 text-sm text-text-secondary">
              We emailed a 6-digit code to {email.trim()}.{" "}
              <button
                type="button"
                onClick={sendCode}
                disabled={sending || resendWait > 0}
                className="font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resendWait > 0 ? `Resend in ${resendWait}s` : "Resend code"}
              </button>
            </p>
          </div>

          <SubmitButton
            pendingText="Starting your trial…"
            disabled={!emailOk || !phoneOk || codeValue.length !== 6}
          >
            Verify &amp; start your 30-day free trial
          </SubmitButton>
        </>
      )}

      <p className="text-center text-xs text-text-secondary">
        Free for 30 days — 30 content credits, 2 map scans &amp; 1 full Deep
        Audit included. No card required.
      </p>

      <p className="pt-1 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>

      <p className="text-center text-sm text-text-secondary">
        <Link href="/tour" className="font-medium text-primary hover:underline">
          See how it works →
        </Link>
      </p>
    </form>
  );
}
