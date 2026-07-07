export type SocialStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted_manually"
  | "rejected";

export const SOCIAL_STATUSES: SocialStatus[];
export function canTransition(from: string, to: string): boolean;
export function assertTransition(from: string, to: string): void;
