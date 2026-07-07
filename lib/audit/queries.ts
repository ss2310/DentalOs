import "server-only";

import type { AuditQuery } from "@/lib/audit/types";

// The L1–L6 AI-visibility query framework, automated: EXACTLY ONE query per layer
// (6 total — no branded/unbranded pairs, no second query per layer). Locale (area,
// city) comes from Settings; the treatment is the clinic's primary rate_cards item
// (high-value first), else a vertical default. clinicName + treatment are wired
// into the branded / procedure layers. L6 stays Hindi/Hinglish since Hindi search
// rank is a scored signal. Layer meanings:
//   L1 Discovery · L2 Procedure · L3 Trust (branded) · L4 Comparison (branded) ·
//   L5 Emergency · L6 Educational
//
// A query is NEVER sent with an unfilled placeholder: if any source field is
// missing, we throw naming it so the run stops instead of asking an engine a
// question with a hole in it (e.g. "is  good" or "{treatment} cost in , ").
export function generateQueries(input: {
  city: string;
  area: string;
  clinicName: string;
  treatments: string[];
}): AuditQuery[] {
  const clinic = input.clinicName.trim();
  const area = input.area.trim();
  const city = input.city.trim();
  const treatment = (input.treatments.find((t) => t && t.trim()) ?? "").trim();

  const missing: string[] = [];
  if (!clinic) missing.push("clinic name (audit_entities.display_name / clinics.business_name)");
  if (!area) missing.push("area (clinics.area — Settings)");
  if (!city) missing.push("city (clinics.city — Settings)");
  if (!treatment)
    missing.push("primary treatment (an active rate_cards item, else DENTAL_TREATMENTS_DEFAULT)");
  if (missing.length) {
    throw new Error(
      `Cannot build AI-visibility queries — unset config: ${missing.join("; ")}. ` +
        `Set these before running Stage 4; a query is never sent with an unfilled placeholder.`,
    );
  }

  return [
    { layer: "L1", text: `best dental clinic in ${area}` }, // Discovery
    { layer: "L2", text: `${treatment} cost in ${area}, ${city}` }, // Procedure
    { layer: "L3", text: `is ${clinic} good` }, // Trust (branded)
    { layer: "L4", text: `${clinic} vs alternatives` }, // Comparison (branded)
    { layer: "L5", text: `emergency dentist near ${area}` }, // Emergency
    { layer: "L6", text: `${treatment} kaise hota hai` }, // Educational (Hindi)
  ];
}
