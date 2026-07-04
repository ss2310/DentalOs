"use client";

import Link from "next/link";
import { useState } from "react";
import { useFormState } from "react-dom";
import { signUpAction, type SignupState } from "./actions";
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

export function SignupForm() {
  const [state, formAction] = useFormState(signUpAction, initialState);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

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

  return (
    <form action={formAction} className="space-y-4">
      {state.error ? (
        <p className="rounded-button border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {state.error}
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
          placeholder="Smile Dental Care"
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
          onChange={(e) => setEmail(e.target.value)}
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

      <SubmitButton pendingText="Creating account…" disabled={!emailOk || !phoneOk}>
        Create account
      </SubmitButton>

      <p className="pt-1 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
