"use client";

import { useState, useTransition } from "react";
import { submitSurvey } from "./actions";

type Step = "rate" | "comment" | "thanks-review" | "thanks-private" | "already";

export function SurveyForm({
  token,
  clinicName,
  doctorName,
  reviewUrl,
}: {
  token: string;
  clinicName: string;
  doctorName: string;
  reviewUrl: string;
}) {
  const [step, setStep] = useState<Step>("rate");
  const [hover, setHover] = useState(0);
  const [lowScore, setLowScore] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  // Drops a leading "Dr."/"Dr" so we can render "Dr. {name}" without doubling.
  const doctorLabel = doctorName.replace(/^dr\.?\s+/i, "").trim();

  function handleResult(res: Awaited<ReturnType<typeof submitSurvey>>) {
    if (res.alreadyDone) {
      setStep("already");
      return;
    }
    if (res.error) {
      setError(res.error);
      return;
    }
    setStep(res.route === "review_request" ? "thanks-review" : "thanks-private");
  }

  function pickStar(n: number) {
    if (pending) return;
    setError("");
    // Promoters (4–5) submit immediately and route to a Google review.
    if (n >= 4) {
      startTransition(async () => handleResult(await submitSurvey(token, n)));
      return;
    }
    // Detractors (1–3) tell us what went wrong first, kept private.
    setLowScore(n);
    setStep("comment");
  }

  function submitLow() {
    if (pending) return;
    setError("");
    startTransition(async () =>
      handleResult(await submitSurvey(token, lowScore, comment)),
    );
  }

  // --- Thank-you screens ---------------------------------------------------
  if (step === "already") {
    return (
      <div className="text-center">
        <p className="text-3xl">🙏</p>
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em] text-text-primary">
          Thank you, already recorded.
        </h1>
      </div>
    );
  }

  if (step === "thanks-review") {
    return (
      <div className="text-center">
        <p className="text-3xl">🌟</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Shukriya! 🙏
        </h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          Aapko accha laga jaan kar khushi hui. Ek chhota sa Google review baaki
          logon ki bhi madad karta hai.
        </p>
        {reviewUrl ? (
          <a
            href={reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 flex min-h-[52px] w-full items-center justify-center rounded-button bg-primary px-5 text-[17px] font-semibold text-white hover:opacity-95"
          >
            Leave us a Google Review 🙏
          </a>
        ) : null}
      </div>
    );
  }

  if (step === "thanks-private") {
    return (
      <div className="text-center">
        <p className="text-3xl">🙏</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Shukriya, aapke feedback ke liye.
        </h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          {doctorLabel ? `Dr. ${doctorLabel}` : "The doctor"} personally will
          look into this. Hum jald hi aapse baat karenge.
        </p>
      </div>
    );
  }

  // --- Comment box (low score) --------------------------------------------
  if (step === "comment") {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text-primary">
          Humein batayein kya behtar ho sakta tha
        </h1>
        <p className="mt-2 text-[15px] text-text-secondary">
          Aapki baat sirf clinic tak jayegi — publicly kahin nahi.
        </p>
        <textarea
          autoFocus
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder="Jo bhi feel hua, likhein…"
          className="mt-4 w-full rounded-card border border-border p-3 text-[15px] text-text-primary focus:border-primary focus:outline-none"
        />
        {error ? (
          <p className="mt-2 text-sm text-danger">{error}</p>
        ) : null}
        <button
          type="button"
          onClick={submitLow}
          disabled={pending}
          className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-button bg-primary px-5 text-[17px] font-semibold text-white hover:opacity-95 disabled:opacity-60"
        >
          {pending ? "Bhej rahe hain…" : "Bhejein"}
        </button>
      </div>
    );
  }

  // --- Star rating (initial) ----------------------------------------------
  return (
    <div className="text-center">
      <h1 className="text-2xl font-semibold leading-snug tracking-[-0.02em] text-text-primary">
        How was your visit to {clinicName}?
      </h1>
      <p className="mt-2 text-[15px] text-text-secondary">
        Tap a star — 30 seconds, bas.
      </p>

      <div
        className="mt-8 flex justify-center gap-2"
        onMouseLeave={() => setHover(0)}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const filled = n <= hover;
          return (
            <button
              key={n}
              type="button"
              disabled={pending}
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onMouseEnter={() => setHover(n)}
              onClick={() => pickStar(n)}
              className="flex h-14 w-14 items-center justify-center text-4xl leading-none transition-transform hover:scale-110 disabled:opacity-60"
            >
              <span className={filled ? "text-primary" : "text-border"}>★</span>
            </button>
          );
        })}
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {pending ? (
        <p className="mt-4 text-sm text-text-secondary">Saving…</p>
      ) : null}
    </div>
  );
}
