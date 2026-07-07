// Live before/after proof for ONE real dental clinic. READ-ONLY: it only SELECTs
// from your normal database (via the service-role key in .env.local) and never
// writes. It reconstructs, from real data, what the topic dropdowns and the
// assembled system prompt look like on the OLD code path vs the NEW
// (vertical-aware) one, and asserts they are byte-for-byte identical for dental.
//
//   node scripts/prove-vertical-parity.mjs
//
// Works whether or not migration 026 is applied yet: it treats every catalog row
// as vertical=NULL (which is exactly what 026 leaves them as).

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { resolveForVertical, verticalDirective } from "../lib/vertical.mjs";

// --- tiny .env.local parser (no dotenv dependency) ---
const env = {};
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m) env[m[1]] = m[2].trim();
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const fillTemplate = (t, vars) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

// Faithful copy of SHARED_SYSTEM_PROMPT (app/api/generate/route.ts). OLD = today;
// NEW = today with the {{vertical_directive}} slot appended to the last line.
const OLD_PROMPT = `You are the marketing content writer for {{clinic_name}}, a dental clinic in {{area}}, {{city}}, India, run by Dr. {{doctor_name}}. Contact: {{clinic_phone}}.
Voice: warm, trustworthy, human — like a caring family dentist, never corporate or salesy.
Hard rules for ALL content:
- Never make medical guarantees or promise outcomes ("100% painless", "guaranteed result", "best in city" are banned).
- Never invent facts, credentials, prices, offers, or specifics. If a detail isn't given to you, stay general or omit it.
- Never use fear-mongering or fake urgency.
- Never reveal or imply any individual patient's medical information.
- Prices only appear if explicitly provided in the context.
- Output ONLY the requested content. No preamble ("Here's your post..."), no explanation, no markdown code fences unless asked for schema.`;
const NEW_PROMPT = OLD_PROMPT + "{{vertical_directive}}";

async function main() {
  const CLINIC_VERTICAL = "dental"; // the default every existing clinic adopts

  const [topicsRes, typesRes, clinicRes] = await Promise.all([
    db.from("topic_suggestions").select("bank, label").eq("is_active", true)
      .order("bank", { ascending: true }).order("sort_order", { ascending: true }),
    db.from("post_types").select("name, platform").neq("platform", "Internal")
      .order("name", { ascending: true }),
    db.from("clinics").select("business_name, city, area, doctor_name, phone")
      .limit(1).maybeSingle(),
  ]);
  for (const r of [topicsRes, typesRes, clinicRes]) {
    if (r.error) { console.error("Query failed:", r.error.message); process.exit(1); }
  }
  const topics = topicsRes.data ?? [];
  const types = typesRes.data ?? [];
  const clinic = clinicRes.data;
  if (!clinic) { console.error("No clinic found to prove against."); process.exit(1); }

  // --- Topic dropdowns: OLD grouping vs NEW (vertical-resolved) grouping ---
  const oldBanks = {};
  for (const r of topics) (oldBanks[r.bank] ??= []).push(r.label);

  const vRows = topics.map((r) => ({ ...r, vertical: null }));
  const newBanks = {};
  for (const r of resolveForVertical(vRows, CLINIC_VERTICAL, (r) => `${r.bank} ${r.label}`)) {
    (newBanks[r.bank] ??= []).push(r.label);
  }
  assert.deepEqual(newBanks, oldBanks, "Topic dropdowns differ!");

  // --- Post-type grid: OLD list vs NEW (vertical-resolved) list ---
  const oldTypeNames = types.map((t) => t.name);
  const newTypeNames = resolveForVertical(
    types.map((t) => ({ ...t, vertical: null })),
    CLINIC_VERTICAL,
    (t) => t.name,
  ).map((t) => t.name);
  assert.deepEqual(newTypeNames, oldTypeNames, "Post-type grid differs!");

  // --- System prompt: OLD vs NEW, filled for the real clinic ---
  const vars = {
    clinic_name: clinic.business_name ?? "our clinic",
    city: clinic.city ?? "",
    area: clinic.area ?? "",
    doctor_name: clinic.doctor_name ?? "our dentist",
    clinic_phone: clinic.phone ?? "",
    vertical_directive: verticalDirective(CLINIC_VERTICAL, "Dental"), // ""
  };
  const oldPrompt = fillTemplate(OLD_PROMPT, vars);
  const newPrompt = fillTemplate(NEW_PROMPT, vars);
  assert.equal(newPrompt, oldPrompt, "System prompt differs for dental!");

  // --- Report ---
  const bankCount = Object.keys(newBanks).length;
  const topicCount = Object.values(newBanks).reduce((n, a) => n + a.length, 0);
  console.log("=== Multi-vertical parity proof — one real dental clinic ===\n");
  console.log(`Clinic:        ${clinic.business_name}  (vertical = ${CLINIC_VERTICAL})`);
  console.log(`Post types:    ${oldTypeNames.length} (OLD) vs ${newTypeNames.length} (NEW)  →  IDENTICAL ✅`);
  console.log(`Topic banks:   ${bankCount}, ${topicCount} topics total  →  dropdowns IDENTICAL ✅`);
  const sampleBank = Object.keys(newBanks)[0];
  if (sampleBank) {
    console.log(`  e.g. bank "${sampleBank}": ${newBanks[sampleBank].slice(0, 3).join(" | ")} …`);
  }
  console.log(`System prompt: ${oldPrompt.length} chars (OLD) vs ${newPrompt.length} chars (NEW)  →  BYTE-IDENTICAL ✅`);
  console.log("\n--- Assembled system prompt (OLD == NEW for dental) ---\n");
  console.log(newPrompt);
  console.log("\nAll parity assertions passed. Dental behavior is unchanged. ✅");
}

main().catch((e) => { console.error(e); process.exit(1); });
