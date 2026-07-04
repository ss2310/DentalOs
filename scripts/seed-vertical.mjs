// Loads a seeds/verticals/<slug>.ts file into the DB (service-role). Seeds the
// vertical's TOPIC SUGGESTIONS (vertical=<slug>); few-shots and compliance rules
// are reported as pending because those store tables don't exist yet.
//
//   npm run seed:vertical -- derma        (or: node scripts/seed-vertical.mjs derma)
//
// Safe to run on the empty template — it writes nothing. Relies on Node's .ts
// type-stripping (Node 22.18+/24) to import the .ts seed file directly.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const slug = (process.argv[2] ?? "").trim();
if (!slug) {
  console.error("Usage: npm run seed:vertical -- <slug>   (e.g. derma)");
  process.exit(1);
}

// --- .env.local parser (no dotenv dependency) ---
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

async function main() {
  // Import the seed file (.ts, type-stripped by Node). Pass the file:// URL from
  // new URL() straight to import() — it already handles Windows drive letters and
  // spaces (%20) correctly; going via .pathname + pathToFileURL double-encodes and
  // breaks on paths with spaces.
  const fileUrl = new URL(`../seeds/verticals/${slug}.ts`, import.meta.url);
  let seed;
  try {
    seed = (await import(fileUrl)).default;
  } catch (e) {
    console.error(`Could not load seeds/verticals/${slug}.ts:`, e.message);
    process.exit(1);
  }
  if (!seed || seed.slug !== slug) {
    console.error(`Seed file's slug ("${seed?.slug}") must match "${slug}".`);
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });

  // The vertical row must exist first (topics FK-reference it).
  const { data: v, error: vErr } = await db
    .from("verticals")
    .select("id, is_active")
    .eq("id", slug)
    .maybeSingle();
  if (vErr) { console.error("verticals lookup failed:", vErr.message); process.exit(1); }
  if (!v) {
    console.error(
      `Vertical "${slug}" isn't in the verticals table yet. Add it first ` +
        `(insert into verticals (id, display_name, is_active) values ('${slug}', '${seed.display_name}', false);) ` +
        `or from /admin/verticals, then re-run.`,
    );
    process.exit(1);
  }

  const topics = seed.topics ?? [];
  const fewShots = seed.few_shots ?? [];
  const compliance = seed.compliance_rules ?? [];

  console.log(`Seeding vertical "${slug}" (${seed.display_name})…`);

  // Idempotency + safety: fully replace only THIS vertical's curated topics on
  // every run. The delete is hard-locked to vertical = slug (never NULL / never
  // 'dental') and to curated global rows, so a re-run removes only rows this same
  // seed created — never a shared or dental row. Refuse 'dental' outright.
  if (slug === "dental") {
    console.error("Refusing to seed/replace the 'dental' shared pool.");
    process.exit(1);
  }
  const { error: delErr, count: delCount } = await db
    .from("topic_suggestions")
    .delete({ count: "exact" })
    .eq("vertical", slug)
    .eq("source", "curated")
    .is("clinic_id", null);
  if (delErr) {
    console.error(`  topics: clear failed — ${delErr.message}`);
    process.exit(1);
  }
  console.log(`  topics: cleared ${delCount ?? 0} existing '${slug}' row(s).`);

  if (topics.length === 0) {
    console.log("  topics: 0 — template is empty, nothing to insert.");
  } else {
    const rows = topics.map((t) => ({
      bank: t.bank,
      label: t.label,
      sort_order: t.sort_order ?? 0,
      vertical: slug,
      source: "curated",
      clinic_id: null,
      is_active: true,
    }));
    const { error } = await db.from("topic_suggestions").insert(rows);
    if (error) {
      // The curated unique index is (bank,label) WHERE clinic_id IS NULL — it is
      // NOT vertical-aware. If a (bank,label) collides with another vertical's
      // topic, add a migration widening that index to include `vertical`.
      console.error(`  topics: insert failed — ${error.message}`);
      process.exit(1);
    }
    console.log(`  topics: inserted ${rows.length}.`);
  }

  // No store tables for these yet — report rather than pretend.
  if (fewShots.length > 0) {
    console.log(
      `  few-shots: ${fewShots.length} defined but SKIPPED — no few_shot_examples table exists yet (add a migration first).`,
    );
  } else {
    console.log("  few-shots: none defined.");
  }
  if (compliance.length > 0) {
    console.log(
      `  compliance: ${compliance.length} defined but SKIPPED — no compliance_rules table exists yet (add a migration first).`,
    );
  } else {
    console.log("  compliance: none defined.");
  }

  console.log("Done.");
}

main().catch((e) => { console.error(e); process.exit(1); });
