import type { AppointmentStatus } from "@/lib/types";

// Badge label + tint per status. Core palette (blue/green/amber/red/gray) uses
// design tokens; in_chair (violet) and recovery_sent (teal) are the two
// spec-requested colors outside the token palette.
export const APPT_STATUS: Record<
  AppointmentStatus,
  { label: string; badge: string }
> = {
  scheduled: { label: "Scheduled", badge: "bg-subtle text-text-secondary" },
  confirmed: { label: "Confirmed", badge: "bg-primary/10 text-primary" },
  arrived: { label: "Arrived", badge: "bg-warning/10 text-warning" },
  in_chair: { label: "In Chair", badge: "bg-violet-100 text-violet-700" },
  completed: { label: "Completed", badge: "bg-success/10 text-success" },
  no_show: { label: "No Show", badge: "bg-danger/10 text-danger" },
  cancelled_patient: { label: "Cancelled", badge: "bg-danger/10 text-danger" },
  rescheduled: { label: "Rescheduled", badge: "bg-subtle text-text-secondary" },
  recovery_sent: { label: "Recovery Sent", badge: "bg-teal-100 text-teal-700" },
};
