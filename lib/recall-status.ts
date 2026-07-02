// Recall status badge labels + tints, shared by /recalls and the patient page.

export type RecallStatus =
  | "pending"
  | "reminded"
  | "scheduled"
  | "completed"
  | "dismissed";

export const RECALL_STATUS: Record<
  RecallStatus,
  { label: string; badge: string }
> = {
  pending: { label: "Pending", badge: "bg-subtle text-text-secondary" },
  reminded: { label: "Reminded", badge: "bg-primary/10 text-primary" },
  scheduled: { label: "Scheduled", badge: "bg-teal-100 text-teal-700" },
  completed: { label: "Completed", badge: "bg-success/10 text-success" },
  dismissed: { label: "Dismissed", badge: "bg-subtle text-text-secondary" },
};

export function humanizeRecallType(t: string): string {
  const s = t.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
