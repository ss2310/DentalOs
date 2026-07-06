// Recurring Deep Audit — pure decision logic + Hinglish message builders
// (dependency-free .mjs so it runs under `node --test`). The cron routes
// (app/api/cron/deep-audit*) do the DB reads/writes and call these for every
// decision + every message, so the behaviour is unit-tested without a DB.

// ---- Tunables (B3-style top-of-file block) --------------------------------
export const RE_AUDIT_DAYS = 30; // re-audit when the last complete run is this old
export const MID_PLAN_NUDGE_DAY = 7; // earliest day after plan creation to nudge
export const MID_PLAN_NUDGE_MAX_DAY = 10; // latest day (so we nudge once, in-window)
export const MID_PLAN_MIN_COMPLETION = 0.3; // < 30% done → stalled
export const COMPETITOR_VELOCITY_MULTIPLE = 3; // rival review velocity > 3× self → watch

const DAY_MS = 86_400_000;

function ageDays(iso, nowMs) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / DAY_MS;
}

// A clinic is due for re-audit if it has never completed a run, or its most
// recent completed run is at least RE_AUDIT_DAYS old.
export function isDueForReaudit(lastCompletedIso, nowMs) {
  const age = ageDays(lastCompletedIso, nowMs);
  return age == null || age >= RE_AUDIT_DAYS;
}

// The mid-plan nudge fires once, in the [7,10]-day window after a plan is
// created — a single check-in, not a daily pester (the *_sent_at stamp also
// guards it).
export function inMidPlanWindow(createdIso, nowMs) {
  const age = ageDays(createdIso, nowMs);
  return age != null && age >= MID_PLAN_NUDGE_DAY && age <= MID_PLAN_NUDGE_MAX_DAY;
}

export function completionPct(doneCount, totalCount) {
  if (!totalCount || totalCount <= 0) return 0;
  return doneCount / totalCount;
}

export function isStalled(doneCount, totalCount) {
  return completionPct(doneCount, totalCount) < MID_PLAN_MIN_COMPLETION;
}

// The easiest still-open action: lowest-day '15-min' pending item, else lowest-day
// pending item. Used to make the mid-plan nudge concrete + encouraging.
export function pickEasiestPending(items) {
  const pending = (items ?? []).filter((i) => i && i.status === "pending");
  if (pending.length === 0) return null;
  const byDay = (a, b) => (a.day_number ?? 99) - (b.day_number ?? 99);
  const quick = pending.filter((i) => i.effort === "15-min").sort(byDay);
  return (quick[0] ?? pending.slice().sort(byDay)[0]) ?? null;
}

// Competitor watch: does any rival grow reviews > 3× faster than us? Returns the
// worst offender for the digest ⚠️ line + to force a Week-1 counter-action.
export function competitorWatch(selfVelocity, rivals) {
  const self = typeof selfVelocity === "number" ? selfVelocity : 0;
  let worst = null;
  for (const r of rivals ?? []) {
    const v = typeof r?.velocity === "number" ? r.velocity : null;
    if (v == null || v <= 0) continue;
    // Compare to max(self, 1) so a clinic at 0 velocity still trips on a fast rival.
    const multiple = v / Math.max(self, 1);
    if (multiple > COMPETITOR_VELOCITY_MULTIPLE && (!worst || v > worst.velocity)) {
      worst = { name: r.name, velocity: v, multiple: Math.round(multiple * 10) / 10 };
    }
  }
  return { flagged: worst != null, worst };
}

// ---- Hinglish message builders (numberless wa.me text) --------------------

export function reauditNudgeMessage(reportOrUpgradeUrl) {
  return (
    "Aapka agla 30-din ka growth plan ready hai — ek extra audit ₹599 mein lein, " +
    `ya plan renew hone par free milega 👇\n${reportOrUpgradeUrl}`
  );
}

export function midPlanNudgeMessage({ pendingCount, easiestTitle, reportUrl }) {
  const easy = easiestTitle
    ? ` — sabse aasan sirf 15 min ka hai: ${easiestTitle}`
    : "";
  return `Aapke plan ke ${pendingCount} kaam pending hain${easy} 👇\n${reportUrl}`;
}

// CAUSE → EFFECT → NEXT. Only includes lines it has real numbers for.
export function deltaDigestMessage({
  completedCount,
  visPrev,
  visNow,
  scorePrev,
  scoreNow,
  watch,
  day1Title,
  reportUrl,
}) {
  const lines = [];
  // CAUSE — what they did
  if (completedCount != null) lines.push(`Aapne ${completedCount} kaam kiye ✅`);
  // EFFECT — what moved
  const moved = [];
  if (visPrev != null && visNow != null && visNow !== visPrev) {
    moved.push(`Visibility ${visPrev}%→${visNow}% 📈`);
  }
  if (scorePrev != null && scoreNow != null && scoreNow !== scorePrev) {
    moved.push(`Digital score ${scorePrev}→${scoreNow}`);
  }
  if (moved.length) lines.push(moved.join(", "));
  // Competitor watch
  if (watch?.flagged && watch.worst) {
    lines.push(
      `${watch.worst.name} ne is mahine reviews ${watch.worst.multiple}x tezi se badhaye ⚠️`,
    );
  }
  // NEXT — the new plan's first action
  if (day1Title) lines.push(`Agla kadam: ${day1Title}`);
  lines.push(`Naya plan dekhein 👇\n${reportUrl}`);
  return lines.join("\n");
}
