"use client";

import { useFormStatus } from "react-dom";

/**
 * Primary submit button that shows a pending state while the parent form's
 * server action is running. Must be rendered inside a <form>.
 */
export function SubmitButton({
  children,
  pendingText = "Please wait…",
}: {
  children: React.ReactNode;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 w-full items-center justify-center rounded-button bg-primary px-4 text-[15px] font-medium text-white transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingText : children}
    </button>
  );
}
