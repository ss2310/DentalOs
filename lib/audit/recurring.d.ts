// Types for the pure recurring-audit logic (recurring.mjs).

export const RE_AUDIT_DAYS: number;
export const MID_PLAN_NUDGE_DAY: number;
export const MID_PLAN_NUDGE_MAX_DAY: number;
export const MID_PLAN_MIN_COMPLETION: number;
export const COMPETITOR_VELOCITY_MULTIPLE: number;

export function isDueForReaudit(lastCompletedIso: string | null, nowMs: number): boolean;
export function inMidPlanWindow(createdIso: string | null, nowMs: number): boolean;
export function completionPct(doneCount: number, totalCount: number): number;
export function isStalled(doneCount: number, totalCount: number): boolean;

export type PlanItemLite = {
  day_number: number;
  effort: string | null;
  status: string;
  title: string | null;
};
export function pickEasiestPending(items: PlanItemLite[]): PlanItemLite | null;

export type RivalVelocity = { name: string; velocity: number | null };
export type CompetitorWatch = {
  flagged: boolean;
  worst: { name: string; velocity: number; multiple: number } | null;
};
export function competitorWatch(
  selfVelocity: number | null,
  rivals: RivalVelocity[],
): CompetitorWatch;

export function reauditNudgeMessage(reportOrUpgradeUrl: string): string;
export function midPlanNudgeMessage(args: {
  pendingCount: number;
  easiestTitle: string | null;
  reportUrl: string;
}): string;
export function deltaDigestMessage(args: {
  completedCount: number | null;
  visPrev: number | null;
  visNow: number | null;
  scorePrev: number | null;
  scoreNow: number | null;
  watch: CompetitorWatch | null;
  day1Title: string | null;
  reportUrl: string;
}): string;
