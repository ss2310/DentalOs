// Lead source labels + status badge tints for /leads.

export const LEAD_SOURCES = [
  "google",
  "instagram",
  "walk_in",
  "referral",
  "justdial",
  "webchat",
  "other",
] as const;

export const LEAD_SOURCE_LABEL: Record<string, string> = {
  google: "Google",
  instagram: "Instagram",
  walk_in: "Walk-in",
  referral: "Referral",
  justdial: "JustDial",
  webchat: "Webchat",
  other: "Other",
};

export type LeadStatus =
  | "new"
  | "contacted"
  | "interested"
  | "booked"
  | "converted"
  | "lost";

export const LEAD_STATUS: Record<
  LeadStatus,
  { label: string; badge: string }
> = {
  new: { label: "New", badge: "bg-primary/10 text-primary" },
  contacted: { label: "Contacted", badge: "bg-warning/10 text-warning" },
  interested: { label: "Interested", badge: "bg-teal-100 text-teal-700" },
  booked: { label: "Booked", badge: "bg-success/10 text-success" },
  converted: { label: "Converted", badge: "bg-success/10 text-success" },
  lost: { label: "Lost", badge: "bg-danger/10 text-danger" },
};
