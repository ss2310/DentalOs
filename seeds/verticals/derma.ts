// TEMPLATE for seeding a new vertical's content. This file is SCAFFOLDING only —
// every list is intentionally EMPTY. Fill it in ONLY when a real clinic in this
// niche is onboarded, then load it with:
//
//     npm run seed:vertical -- derma
//
// Copy this file to seeds/verticals/<slug>.ts for each new vertical. The vertical
// row itself must already exist in the `verticals` table (add it in
// /admin/verticals) before seeding, because the rows below FK-reference it.

export type VerticalTopic = { bank: string; label: string; sort_order: number };
export type FewShot = { post_type: string; example: string };
export type ComplianceRule = { rule: string };

export type VerticalSeed = {
  slug: string;
  display_name: string;
  topics: VerticalTopic[];
  few_shots: FewShot[];
  compliance_rules: ComplianceRule[];
};

const seed: VerticalSeed = {
  slug: "derma",
  display_name: "Dermatology",

  // ── TOPIC BANKS ──────────────────────────────────────────────────────────
  // One entry per suggested topic, grouped by `bank`. Banks mirror dental's set:
  // social · article · service · guide · comparison · question · occasion · update
  // (see supabase/migrations/012_topic_suggestions.sql for dental's full list).
  // LEAVE EMPTY until real content is written. Dental examples, commented, show
  // the exact structure to copy:
  topics: [
    // { bank: "social",     label: "Acne myths busted",                    sort_order: 1 },
    // { bank: "social",     label: "Why sunscreen matters in India",       sort_order: 2 },
    // { bank: "article",    label: "Complete guide to laser hair removal",  sort_order: 1 },
    // { bank: "service",    label: "Chemical Peel",                         sort_order: 1 },
    // { bank: "service",    label: "Laser Hair Removal",                    sort_order: 2 },
    // { bank: "comparison", label: "Chemical Peel vs Microdermabrasion",    sort_order: 1 },
    // { bank: "question",   label: "Is laser hair removal permanent?",      sort_order: 1 },
    // { bank: "occasion",   label: "Wedding-season glow package",           sort_order: 1 },
    // { bank: "update",     label: "New Q-switched laser installed",        sort_order: 1 },
  ],

  // ── FEW-SHOT EXAMPLES ────────────────────────────────────────────────────
  // Approved sample outputs for the three priority types, to steer tone/format.
  // LEAVE EMPTY for now. NOTE: no few-shot store table exists yet — the loader
  // reports these as pending (add a `few_shot_examples` table + migration before
  // these can be written).
  few_shots: [
    // { post_type: "GBP Post",          example: "" },
    // { post_type: "Instagram Caption", example: "" },
    // { post_type: "Review Response",   example: "" },
  ],

  // ── COMPLIANCE-RULE SLOTS ────────────────────────────────────────────────
  // Niche-specific guardrails layered on top of the shared brand-safety rules
  // (e.g. derma: no permanent-cure claims, no prescription-drug promotion, no
  // unrealistic before/after promises). LEAVE EMPTY for now. NOTE: no
  // compliance_rules table exists yet — the loader reports these as pending.
  compliance_rules: [
    // { rule: "Never claim a permanent cure for a chronic skin condition." },
    // { rule: "Never promote prescription-only medication by name." },
  ],
};

export default seed;
