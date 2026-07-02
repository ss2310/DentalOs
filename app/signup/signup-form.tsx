"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { signUpAction, type SignupState } from "./actions";
import { SubmitButton } from "@/components/submit-button";

const initialState: SignupState = {};

const inputClass =
  "h-11 w-full rounded-button border border-border px-3 text-[15px] text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const labelClass = "mb-1.5 block text-sm font-medium text-text-primary";

export function SignupForm() {
  const [state, formAction] = useFormState(signUpAction, initialState);

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
          className={inputClass}
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
          className={inputClass}
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
          className={inputClass}
          placeholder="you@clinic.com"
        />
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
          minLength={6}
          className={inputClass}
          placeholder="At least 6 characters"
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
            className={inputClass}
            placeholder="98XXXXXXXX"
          />
        </div>
        <div>
          <label htmlFor="city" className={labelClass}>
            City
          </label>
          <input
            id="city"
            name="city"
            type="text"
            className={inputClass}
            placeholder="Mumbai"
          />
        </div>
      </div>

      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>

      <p className="pt-1 text-center text-sm text-text-secondary">
        Already have an account?{" "}
        <Link href="/" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
