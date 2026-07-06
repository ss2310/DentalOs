import "server-only";

import type { AuditQuery } from "@/lib/audit/types";
import { DENTAL_TREATMENTS_DEFAULT } from "@/lib/audit/config";

// The L1–L6 AI-visibility query framework, automated: ONE query per layer (6
// total). Locale (area, city) comes from Settings; the treatment comes from the
// clinic's rate_cards menu (high-value first), else a vertical default. L6 stays
// Hindi/Hinglish since Hindi search rank is a scored signal. Layer meanings:
//   L1 Discovery · L2 Procedure · L3 Trust · L4 Comparison · L5 Emergency · L6 Educational
export function generateQueries(input: {
  city: string;
  area: string;
  clinicName: string;
  treatments: string[];
}): AuditQuery[] {
  const t = (input.treatments.length ? input.treatments : DENTAL_TREATMENTS_DEFAULT)
    .map((s) => s.trim())
    .filter(Boolean);
  const t0 = t[0] ?? "dental implants";
  const area = input.area.trim() || input.city.trim();
  const city = input.city.trim() || area;
  // "Area, City" locale phrase, collapsing to one when they're the same/blank.
  const loc = [area, city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ");

  return [
    { layer: "L1", text: `best dental clinics in ${loc}` }, // Discovery
    { layer: "L2", text: `${t0} cost in ${loc}` }, // Procedure
    { layer: "L3", text: `most trusted dentist in ${area}` }, // Trust
    { layer: "L4", text: `top 5 dentists in ${city}` }, // Comparison
    { layer: "L5", text: `emergency dentist near ${area}` }, // Emergency
    { layer: "L6", text: `${t0} kaise hota hai` }, // Educational (Hindi)
  ];
}
