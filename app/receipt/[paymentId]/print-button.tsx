"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="flex h-11 items-center rounded-button bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90"
    >
      Print / Save PDF
    </button>
  );
}
