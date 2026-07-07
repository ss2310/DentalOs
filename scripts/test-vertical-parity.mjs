// Parity tests for the multi-vertical foundation (lib/vertical.mjs). Proves the
// core guarantee: for a DENTAL clinic, nothing changes.
//   node --test scripts/test-vertical-parity.mjs   (or: npm test)

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_VERTICAL,
  resolveForVertical,
  verticalDirective,
} from "../lib/vertical.mjs";

// Local copy of lib/generate.ts fillTemplate (pure, one line) so the prompt
// byte-identity check needs no build step.
const fillTemplate = (t, vars) =>
  t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

const topicKey = (r) => `${r.bank} ${r.label}`;
const nameKey = (r) => r.name;

test("dental: topic suggestions resolve to the exact same rows, same order", () => {
  // Every catalog row is NULL today; note the label that recurs across banks.
  const rows = [
    { bank: "social", label: "Bleeding gums", vertical: null },
    { bank: "article", label: "How many visits does a root canal take?", vertical: null },
    { bank: "question", label: "How many visits does a root canal take?", vertical: null },
    { bank: "service", label: "Dental Implants", vertical: null },
  ];
  assert.deepEqual(resolveForVertical(rows, "dental", topicKey), rows);
});

test("dental: post types resolve to the exact same rows, same order", () => {
  const rows = [
    { name: "Blog Article", vertical: null },
    { name: "GBP Post", vertical: null },
    { name: "Service Page", vertical: null },
  ];
  assert.deepEqual(resolveForVertical(rows, "dental", nameKey), rows);
});

test("dental: rows with an ABSENT vertical field (pre-migration fallback) are all kept", () => {
  const rows = [{ name: "GBP Post" }, { name: "Blog Article" }];
  assert.deepEqual(resolveForVertical(rows, "dental", nameKey), rows);
});

test("directive is EMPTY for dental (byte-identical prompt)", () => {
  assert.equal(verticalDirective("dental", "Dental"), "");
  assert.equal(DEFAULT_VERTICAL, "dental");
});

test("directive renders the line for a non-dental vertical", () => {
  assert.equal(
    verticalDirective("derma", "Derma"),
    "\nYou write for a Derma clinic.",
  );
});

test("shared system prompt is byte-identical for dental once the slot is added", () => {
  const OLD = `You are the marketing content writer for {{clinic_name}}, a dental clinic in {{area}}, {{city}}, India, run by Dr. {{doctor_name}}. Contact: {{clinic_phone}}.
- Output ONLY the requested content. No preamble, no explanation.`;
  const NEW = OLD.replace(
    "No preamble, no explanation.",
    "No preamble, no explanation.{{vertical_directive}}",
  );
  const dentalVars = {
    clinic_name: "Bright Smile Dental",
    area: "Andheri",
    city: "Mumbai",
    doctor_name: "Sharma",
    clinic_phone: "9800000000",
    vertical_directive: verticalDirective("dental", "Dental"), // ""
  };
  // Byte-for-byte identical to the pre-migration prompt.
  assert.equal(fillTemplate(NEW, dentalVars), fillTemplate(OLD, dentalVars));

  // And for a non-dental vertical, it differs by exactly the one line.
  const dermaFilled = fillTemplate(NEW, {
    ...dentalVars,
    vertical_directive: verticalDirective("derma", "Derma"),
  });
  assert.equal(
    dermaFilled,
    fillTemplate(OLD, dentalVars) + "\nYou write for a Derma clinic.",
  );
});

test("never returns another vertical's rows; a specific row beats the shared one", () => {
  const rows = [
    { name: "GBP Post", vertical: null }, // shared
    { name: "GBP Post", vertical: "derma" }, // derma override for same slot
    { name: "Derma Peel Promo", vertical: "derma" }, // derma-only
  ];
  // Dental sees only the shared row, nothing derma.
  assert.deepEqual(resolveForVertical(rows, "dental", nameKey), [
    { name: "GBP Post", vertical: null },
  ]);
  // Derma prefers its override for GBP Post and gets its own extra type.
  assert.deepEqual(resolveForVertical(rows, "derma", nameKey), [
    { name: "GBP Post", vertical: "derma" },
    { name: "Derma Peel Promo", vertical: "derma" },
  ]);
});
