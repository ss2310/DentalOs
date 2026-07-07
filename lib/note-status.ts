import type { ClinicNoteStatus } from "@/lib/types";

// Shared status → label + pill styling for voice notes, so the /notes inbox, the
// patient profile, and the card all read the same. Mirrors the shape of
// lib/recall-status.ts. Teal-free neutrals except the semantic states.
export const NOTE_STATUS: Record<
  ClinicNoteStatus,
  { label: string; badge: string }
> = {
  processing: { label: "Processing", badge: "bg-subtle text-text-secondary" },
  pending_review: { label: "Review", badge: "bg-warning/10 text-warning" },
  confirmed: { label: "Saved", badge: "bg-success/10 text-success" },
  failed: { label: "Failed", badge: "bg-danger/10 text-danger" },
};

// The status values a user can filter the inbox by, in display order. "all" is
// handled by the page as "no filter".
export const NOTE_STATUS_FILTERS: {
  value: ClinicNoteStatus | "all";
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "pending_review", label: "To review" },
  { value: "confirmed", label: "Saved" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
];

export function isNoteStatus(v: string): v is ClinicNoteStatus {
  return (
    v === "processing" ||
    v === "pending_review" ||
    v === "confirmed" ||
    v === "failed"
  );
}
