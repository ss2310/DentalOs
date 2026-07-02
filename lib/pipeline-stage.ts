// Pipeline stage badge labels + tints, shared by /pipeline and the patient
// page. scheduled = teal (outside the token palette, matching in_chair).

export type PipelineStage =
  | "identified"
  | "presented"
  | "thinking"
  | "accepted"
  | "scheduled"
  | "completed"
  | "rejected";

export const PIPELINE_STAGE: Record<
  PipelineStage,
  { label: string; badge: string }
> = {
  identified: { label: "Identified", badge: "bg-subtle text-text-secondary" },
  presented: { label: "Presented", badge: "bg-primary/10 text-primary" },
  thinking: { label: "Thinking", badge: "bg-warning/10 text-warning" },
  accepted: { label: "Accepted", badge: "bg-success/10 text-success" },
  scheduled: { label: "Scheduled", badge: "bg-teal-100 text-teal-700" },
  completed: { label: "Completed", badge: "bg-success/10 text-success" },
  rejected: { label: "Rejected", badge: "bg-danger/10 text-danger" },
};
