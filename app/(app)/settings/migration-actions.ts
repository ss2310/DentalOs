"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import {
  ENTITIES,
  ENTITY_KEYS,
  LIMITS,
  buildRecord,
  type DetectionResult,
  type EntityKey,
  type Mapping,
} from "@/lib/data-migration";

const MODEL = "claude-sonnet-4-6";

// Settings → Data Migration is owner/doctor-only. Server actions are public
// endpoints, so gate role here too (not just the page) — SEC-M5 lesson.
async function requireAdminUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." as const };
  if (!isAdminRole(await getUserRole()))
    return { error: "Only an owner or doctor can import data." as const };
  return { supabase, userId: user.id };
}

// Compact catalog of importable entities + fields, handed to the AI.
function catalog(): string {
  return ENTITY_KEYS.map((k) => {
    const e = ENTITIES[k];
    const fields = e.fields
      .map(
        (f) =>
          `    - ${f.key} (${f.label}${f.required ? ", REQUIRED" : ""}, ${f.type})`,
      )
      .join("\n");
    return `Entity "${k}" — ${e.description}\n${fields}`;
  }).join("\n\n");
}

/**
 * Ask Claude to (a) detect which GrowthOS entity a CSV represents and
 * (b) map its columns to our fields. FREE (no credits) but hard-capped: only
 * the headers + a few truncated sample rows are ever sent — never the whole
 * file (SEC-H2 cost-abuse guard).
 */
export async function detectMapping(input: {
  headers: string[];
  sampleRows: Record<string, string>[];
}): Promise<{ result?: DetectionResult; error?: string }> {
  const gate = await requireAdminUser();
  if ("error" in gate) return { error: gate.error };

  const headers = (input.headers ?? [])
    .map((h) => String(h).trim())
    .filter(Boolean)
    .slice(0, LIMITS.aiMaxHeaders);
  if (headers.length === 0) return { error: "No columns found in the file." };

  const sample = (input.sampleRows ?? [])
    .slice(0, LIMITS.aiSampleRows)
    .map((row) => {
      const out: Record<string, string> = {};
      for (const h of headers) {
        out[h] = String(row[h] ?? "").slice(0, LIMITS.aiCellChars);
      }
      return out;
    });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "AI is not configured on the server yet." };

  const prompt = `A dental clinic is importing a CSV exported from their old software. Decide which GrowthOS entity it best matches, and map each CSV column to a GrowthOS field.

GROWTHOS ENTITIES AND FIELDS:
${catalog()}

CSV COLUMN HEADERS:
${JSON.stringify(headers)}

SAMPLE ROWS (values truncated):
${JSON.stringify(sample, null, 2)}

Respond with ONLY a JSON object (no prose, no markdown) in exactly this shape:
{
  "entity": "<one of: ${ENTITY_KEYS.join(", ")}>",
  "mapping": { "<csv header>": "<growthos field key or null>", ... },
  "confidence": "high" | "medium" | "low",
  "note": "<one short sentence explaining the choice>"
}
Rules: include EVERY csv header as a key in "mapping"; use null when a column has no good GrowthOS field; never map two csv columns to the same field; only use field keys that exist for the chosen entity.`;

  let raw: string;
  try {
    const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 1 });
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 900,
      system:
        "You map messy CSV columns from dental practice-management software to a fixed set of import fields. You reply with a single valid JSON object and nothing else.",
      messages: [{ role: "user", content: prompt }],
    });
    raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
  } catch (err) {
    console.error("Mapping detection failed:", err);
    return { error: "Couldn't analyse the file. You can map the columns yourself below." };
  }

  const parsed = safeParseDetection(raw, headers);
  if (!parsed)
    return { error: "The AI response wasn't usable. You can map the columns yourself below." };
  return { result: parsed };
}

// Parse + SANITISE the model's JSON. Never trust it: coerce entity to a known
// key, drop mapping headers we didn't send, drop field keys that don't belong
// to the entity, and enforce one-csv-column-per-field.
function safeParseDetection(
  raw: string,
  headers: string[],
): DetectionResult | null {
  // Tolerate accidental code fences.
  const jsonText = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let obj: unknown;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  const o = obj as Record<string, unknown>;

  const entity: EntityKey = ENTITY_KEYS.includes(o.entity as EntityKey)
    ? (o.entity as EntityKey)
    : "patients";
  const validFieldKeys = new Set(ENTITIES[entity].fields.map((f) => f.key));

  const mapping: Mapping = {};
  const usedFields = new Set<string>();
  const rawMap =
    o.mapping && typeof o.mapping === "object"
      ? (o.mapping as Record<string, unknown>)
      : {};
  for (const h of headers) {
    const target = rawMap[h];
    if (
      typeof target === "string" &&
      validFieldKeys.has(target) &&
      !usedFields.has(target)
    ) {
      mapping[h] = target;
      usedFields.add(target);
    } else {
      mapping[h] = null;
    }
  }

  const confidence =
    o.confidence === "high" || o.confidence === "medium" || o.confidence === "low"
      ? o.confidence
      : "medium";
  const note =
    typeof o.note === "string" ? o.note.slice(0, 200) : undefined;

  return { entity, mapping, confidence, note };
}

/**
 * Validate + insert the mapped rows for the chosen entity. Rows that fail
 * validation (missing required field / unreadable value) are skipped and
 * counted; valid rows are inserted with the caller's clinic_id (RLS also
 * scopes the write). No AI call here.
 */
export async function importRecords(input: {
  entity: EntityKey;
  mapping: Mapping;
  rows: Record<string, string>[];
}): Promise<{
  imported?: number;
  skipped?: number;
  problems?: string[];
  error?: string;
}> {
  const gate = await requireAdminUser();
  if ("error" in gate) return { error: gate.error };
  const { supabase } = gate;

  if (!ENTITY_KEYS.includes(input.entity))
    return { error: "Unknown import type." };
  const entity = ENTITIES[input.entity];

  const rows = (input.rows ?? []).slice(0, LIMITS.maxRows);
  if (rows.length === 0) return { error: "There are no rows to import." };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id")
    .single();
  if (!clinic?.id) return { error: "No clinic found for this account." };

  const valid: Record<string, string | number | null>[] = [];
  const problems: string[] = [];
  let skipped = 0;

  rows.forEach((csvRow, i) => {
    const { record, problems: rowProblems } = buildRecord(
      entity,
      input.mapping,
      csvRow,
    );
    if (rowProblems.length > 0) {
      skipped++;
      if (problems.length < 20)
        problems.push(`Row ${i + 2}: ${rowProblems.join("; ")}`);
      return;
    }
    valid.push({ ...record, clinic_id: clinic.id });
  });

  if (valid.length === 0)
    return { imported: 0, skipped, problems, error: "No rows were valid to import." };

  const { error } = await supabase.from(entity.table).insert(valid);
  if (error) {
    console.error("Import insert failed:", error);
    return { error: "The import failed while saving. Please try again." };
  }

  revalidatePath("/settings");
  if (input.entity === "patients") revalidatePath("/patients");
  return { imported: valid.length, skipped, problems };
}
