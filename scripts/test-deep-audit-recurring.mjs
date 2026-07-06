// Tests for the recurring Deep Audit pure logic (lib/audit/recurring.mjs):
// re-audit due window, mid-plan stall window, easiest-item pick, competitor-watch
// threshold, and the CAUSE→EFFECT→NEXT digest assembly.
//   node --test scripts/test-deep-audit-recurring.mjs   (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RE_AUDIT_DAYS,
  isDueForReaudit,
  inMidPlanWindow,
  isStalled,
  pickEasiestPending,
  competitorWatch,
  midPlanNudgeMessage,
  deltaDigestMessage,
  reauditNudgeMessage,
} from "../lib/audit/recurring.mjs";

const NOW = Date.UTC(2026, 6, 6); // fixed clock
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString();

test("isDueForReaudit: never-audited or >=30d → due; <30d → not", () => {
  assert.equal(isDueForReaudit(null, NOW), true);
  assert.equal(isDueForReaudit(daysAgo(RE_AUDIT_DAYS), NOW), true);
  assert.equal(isDueForReaudit(daysAgo(RE_AUDIT_DAYS + 5), NOW), true);
  assert.equal(isDueForReaudit(daysAgo(29), NOW), false);
  assert.equal(isDueForReaudit(daysAgo(1), NOW), false);
});

test("inMidPlanWindow: only fires in the 7-10 day window", () => {
  assert.equal(inMidPlanWindow(daysAgo(6), NOW), false);
  assert.equal(inMidPlanWindow(daysAgo(7), NOW), true);
  assert.equal(inMidPlanWindow(daysAgo(9), NOW), true);
  assert.equal(inMidPlanWindow(daysAgo(10), NOW), true);
  assert.equal(inMidPlanWindow(daysAgo(11), NOW), false);
});

test("isStalled: < 30% completion", () => {
  assert.equal(isStalled(2, 17), true); // ~12% → stalled
  assert.equal(isStalled(5, 17), true); // ~29% → still stalled
  assert.equal(isStalled(6, 17), false); // ~35% → ok
  assert.equal(isStalled(3, 10), false); // 30% exactly → not stalled
  assert.equal(isStalled(0, 0), true); // nothing done, guard
});

test("pickEasiestPending: lowest-day 15-min pending, else lowest-day pending", () => {
  const items = [
    { day_number: 2, effort: "1-hour", status: "pending", title: "A" },
    { day_number: 9, effort: "15-min", status: "pending", title: "Quick late" },
    { day_number: 5, effort: "15-min", status: "done", title: "Done quick" },
    { day_number: 7, effort: "15-min", status: "pending", title: "Quick early" },
  ];
  assert.equal(pickEasiestPending(items).title, "Quick early"); // day 7 < day 9
  // no 15-min pending → lowest-day pending overall
  const noQuick = [
    { day_number: 8, effort: "1-hour", status: "pending", title: "Later" },
    { day_number: 3, effort: "needs-help", status: "pending", title: "Earlier" },
  ];
  assert.equal(pickEasiestPending(noQuick).title, "Earlier");
  assert.equal(pickEasiestPending([]), null);
});

test("competitorWatch: flags a rival growing >3x faster than self", () => {
  const w = competitorWatch(2, [
    { name: "Dr. X", velocity: 14 }, // 7x
    { name: "Dr. Y", velocity: 4 }, // 2x — below threshold
  ]);
  assert.equal(w.flagged, true);
  assert.equal(w.worst.name, "Dr. X");
  assert.equal(w.worst.multiple, 7);
  // self at 0 still trips on a fast rival (uses max(self,1))
  assert.equal(competitorWatch(0, [{ name: "Z", velocity: 4 }]).flagged, true);
  // nobody fast enough
  assert.equal(competitorWatch(5, [{ name: "Q", velocity: 10 }]).flagged, false);
});

test("midPlanNudgeMessage: names the count + easiest task + link", () => {
  const m = midPlanNudgeMessage({ pendingCount: 12, easiestTitle: "Ask 10 patients for a review", reportUrl: "https://x/r" });
  assert.match(m, /12 kaam pending/);
  assert.match(m, /15 min ka hai: Ask 10 patients/);
  assert.match(m, /https:\/\/x\/r/);
});

test("deltaDigestMessage: CAUSE→EFFECT→NEXT with only the numbers it has", () => {
  const m = deltaDigestMessage({
    completedCount: 8,
    visPrev: 42,
    visNow: 58,
    scorePrev: 24,
    scoreNow: 31,
    watch: { flagged: true, worst: { name: "Dr. X", velocity: 14, multiple: 7 } },
    day1Title: "Add WhatsApp CTA to your Google profile",
    reportUrl: "https://x/r2",
  });
  assert.match(m, /Aapne 8 kaam kiye ✅/);
  assert.match(m, /Visibility 42%→58%/);
  assert.match(m, /Dr\. X ne is mahine reviews 7x tezi se/);
  assert.match(m, /Agla kadam: Add WhatsApp CTA/);
  assert.match(m, /https:\/\/x\/r2/);
  // omits lines it has no data for
  const sparse = deltaDigestMessage({
    completedCount: 0,
    visPrev: null,
    visNow: null,
    scorePrev: null,
    scoreNow: null,
    watch: null,
    day1Title: null,
    reportUrl: "https://x/r3",
  });
  assert.doesNotMatch(sparse, /Visibility/);
  assert.doesNotMatch(sparse, /⚠️/);
  assert.match(sparse, /Aapne 0 kaam kiye/);
});

test("reauditNudgeMessage: offers ₹599 or renewal + link", () => {
  const m = reauditNudgeMessage("https://x/upgrade");
  assert.match(m, /₹599/);
  assert.match(m, /renew/);
  assert.match(m, /https:\/\/x\/upgrade/);
});
