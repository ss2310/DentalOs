// Recovery type + outcome badge labels and tints, shared by /recovery and the
// dashboard. Positive outcomes (rebooked/accepted/returned/paid) are green;
// lost is red. Types get mild distinct tints.

export type RecoveryType =
  | "no_show"
  | "cancelled"
  | "deferred_treatment"
  | "recall_overdue"
  | "outstanding_payment";

export type RecoveryOutcome =
  | "rebooked"
  | "accepted"
  | "returned"
  | "paid"
  | "lost";

export const RECOVERY_TYPE: Record<
  RecoveryType,
  { label: string; badge: string }
> = {
  no_show: { label: "No-Show", badge: "bg-warning/10 text-warning" },
  cancelled: { label: "Cancelled", badge: "bg-danger/10 text-danger" },
  deferred_treatment: { label: "Deferred", badge: "bg-primary/10 text-primary" },
  recall_overdue: { label: "Recall", badge: "bg-teal-100 text-teal-700" },
  outstanding_payment: {
    label: "Outstanding",
    badge: "bg-orange-100 text-orange-700",
  },
};

export const RECOVERY_OUTCOME: Record<
  RecoveryOutcome,
  { label: string; badge: string }
> = {
  rebooked: { label: "Rebooked", badge: "bg-success/10 text-success" },
  accepted: { label: "Accepted", badge: "bg-success/10 text-success" },
  returned: { label: "Returned", badge: "bg-success/10 text-success" },
  paid: { label: "Paid", badge: "bg-success/10 text-success" },
  lost: { label: "Lost", badge: "bg-danger/10 text-danger" },
};

export const POSITIVE_OUTCOMES: RecoveryOutcome[] = [
  "rebooked",
  "accepted",
  "returned",
  "paid",
];
