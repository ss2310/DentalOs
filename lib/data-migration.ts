// Shared logic for the Settings → Data Migration feature (AI-assisted CSV
// import). Pure functions only — imported by BOTH the client wizard
// (components preview) and the server import action, so parsing, coercion, and
// validation can never drift between preview and the actual write.
//
// Scope (v1): the two STANDALONE entities a clinic can import cold — patients
// and treatments (rate_cards). Appointments/dues need patient linkage and are
// intentionally out of scope until patients exist.

import { normalizeIndianPhone } from "@/lib/validation";

export type FieldType = "text" | "phone" | "date" | "number" | "int" | "gender";

export type TargetField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
};

export type EntityDef = {
  key: EntityKey;
  label: string;
  table: string;
  description: string;
  fields: TargetField[];
};

export type EntityKey = "patients" | "rate_cards";

export const ENTITIES: Record<EntityKey, EntityDef> = {
  patients: {
    key: "patients",
    label: "Patients",
    table: "patients",
    description: "Your patient list — names, phone numbers, and basic details.",
    fields: [
      { key: "full_name", label: "Full name", type: "text", required: true },
      { key: "whatsapp_number", label: "WhatsApp number", type: "phone" },
      { key: "phone", label: "Phone", type: "phone" },
      { key: "date_of_birth", label: "Date of birth", type: "date" },
      { key: "gender", label: "Gender", type: "gender" },
      { key: "area", label: "Area / locality", type: "text" },
      { key: "last_visit_date", label: "Last visit date", type: "date" },
      { key: "notes", label: "Notes", type: "text" },
    ],
  },
  rate_cards: {
    key: "rate_cards",
    label: "Treatments / Rate card",
    table: "rate_cards",
    description: "Your treatments and their prices.",
    fields: [
      { key: "treatment_name", label: "Treatment name", type: "text", required: true },
      { key: "category", label: "Category", type: "text" },
      { key: "base_price", label: "Price (₹)", type: "number" },
      { key: "duration_mins", label: "Duration (mins)", type: "int" },
      {
        key: "recall_interval_days",
        label: "Recall interval (days)",
        type: "int",
        hint: "Days until the patient is due again",
      },
    ],
  },
};

export const ENTITY_KEYS = Object.keys(ENTITIES) as EntityKey[];

// A CSV-header → target-field mapping. null means "leave this field empty".
export type Mapping = Record<string, string | null>;

export type DetectionResult = {
  entity: EntityKey;
  mapping: Mapping;
  confidence: "high" | "medium" | "low";
  note?: string;
};

// ---------------------------------------------------------------------------
// CSV parsing — a small state machine that handles quoted fields (with commas,
// newlines, and "" escapes) and CRLF/LF. No external dependency (CLAUDE.md #7).
// ---------------------------------------------------------------------------

export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      // End the row on \n, or on a lone \r; swallow the \n of a \r\n pair.
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (file not ending in a newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully-empty rows (common trailing blank lines).
  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map((h) => h.trim());
  const dataRows = nonEmpty.slice(1);
  return { headers, rows: dataRows };
}

// Turn parsed rows into keyed objects using the header row.
export function rowsToObjects(
  headers: string[],
  rows: string[][],
): Record<string, string>[] {
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Value coercion + validation, per field type.
// ---------------------------------------------------------------------------

export type CoercedValue = {
  value: string | number | null;
  ok: boolean; // false = present but couldn't be parsed (flag in preview)
  raw: string;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function pad(n: string): string {
  return n.length === 1 ? "0" + n : n;
}

// Parse the common Indian date shapes into ISO YYYY-MM-DD. Assumes DAY-first
// for slash/dash numeric dates (DD/MM/YYYY) — the norm in India.
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already ISO-ish: YYYY-MM-DD.
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) {
    const iso = `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    return isRealDate(iso) ? iso : null;
  }

  // DD/MM/YYYY or DD-MM-YYYY (day first).
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (m) {
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    const iso = `${year}-${pad(m[2])}-${pad(m[1])}`;
    return isRealDate(iso) ? iso : null;
  }

  // DD MMM YYYY  /  MMM DD, YYYY.
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3,})[ -](\d{2,4})$/);
  if (m) {
    const mm = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    if (mm) {
      const iso = `${year}-${mm}-${pad(m[1])}`;
      return isRealDate(iso) ? iso : null;
    }
  }
  m = s.match(/^([A-Za-z]{3,})[ -](\d{1,2}),?[ -](\d{2,4})$/);
  if (m) {
    const mm = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const year = m[3].length === 2 ? "20" + m[3] : m[3];
    if (mm) {
      const iso = `${year}-${mm}-${pad(m[2])}`;
      return isRealDate(iso) ? iso : null;
    }
  }
  return null;
}

function isRealDate(iso: string): boolean {
  const [y, mo, d] = iso.split("-").map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function parseNumber(raw: string): number | null {
  // Strip currency symbols, commas, spaces; keep digits, dot, minus.
  const cleaned = raw.replace(/[^0-9.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseGender(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  if (["m", "male", "man", "boy"].includes(s)) return "Male";
  if (["f", "female", "woman", "girl"].includes(s)) return "Female";
  return "Other";
}

export function coerce(type: FieldType, raw: string): CoercedValue {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { value: null, ok: true, raw: trimmed };

  switch (type) {
    case "text":
      return { value: trimmed.slice(0, 2000), ok: true, raw: trimmed };
    case "phone": {
      const p = normalizeIndianPhone(trimmed);
      return { value: p, ok: p !== null, raw: trimmed };
    }
    case "date": {
      const d = parseDate(trimmed);
      return { value: d, ok: d !== null, raw: trimmed };
    }
    case "number": {
      const n = parseNumber(trimmed);
      return { value: n, ok: n !== null, raw: trimmed };
    }
    case "int": {
      const n = parseNumber(trimmed);
      return {
        value: n === null ? null : Math.round(n),
        ok: n !== null,
        raw: trimmed,
      };
    }
    case "gender":
      return { value: parseGender(trimmed), ok: true, raw: trimmed };
    default:
      return { value: trimmed, ok: true, raw: trimmed };
  }
}

// Build a single DB-ready record from a raw CSV object + the chosen mapping.
// Returns the record plus per-field validation problems (bad values / missing
// required fields) for the preview and the import summary.
export function buildRecord(
  entity: EntityDef,
  mapping: Mapping,
  csvRow: Record<string, string>,
): { record: Record<string, string | number | null>; problems: string[] } {
  const record: Record<string, string | number | null> = {};
  const problems: string[] = [];

  for (const field of entity.fields) {
    // Find the CSV header mapped to this target field.
    const header = Object.keys(mapping).find((h) => mapping[h] === field.key);
    const raw = header ? (csvRow[header] ?? "") : "";
    const c = coerce(field.type, raw);

    if (field.required && (c.value === null || c.value === "")) {
      problems.push(`${field.label} is required but empty`);
    } else if (!c.ok) {
      problems.push(`${field.label}: couldn't read "${c.raw}"`);
    }
    record[field.key] = c.value;
  }

  return { record, problems };
}

// Hard caps (also enforced server-side) — keep the AI + import bounded.
export const LIMITS = {
  maxFileBytes: 5 * 1024 * 1024, // 5 MB CSV
  maxRows: 5000, // rows imported per run
  aiSampleRows: 8, // rows sent to the AI for detection
  aiMaxHeaders: 60, // columns considered
  aiCellChars: 80, // per-cell truncation in the AI sample
};
