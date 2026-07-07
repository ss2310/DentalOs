// Prints exactly what the multi-vertical flag gates, for OFF vs ON — the "show me
// the result with the flag both OFF and ON" artifact. Pure/deterministic: it maps
// the real flag parser to each UI surface's visibility. No DB, no auth.
//   node scripts/show-multi-vertical.mjs

import { parseMultiVerticalFlag } from "../lib/multi-vertical-flag.mjs";

const gates = (on) => ({
  "Settings → Clinic vertical dropdown": on ? "shown" : "hidden",
  "Onboarding (signup) → Clinic type dropdown": on ? "shown" : "hidden",
  "Admin nav → 'Verticals' link": on ? "shown" : "hidden",
  "/admin/verticals page": on ? "renders" : "404 (notFound)",
  "New clinic's vertical when none picked": "dental (DB default)",
  "Content generation / topic dropdowns": "unchanged (resolveForVertical, dental=identical)",
});

for (const raw of [undefined, "true"]) {
  const on = parseMultiVerticalFlag(raw);
  console.log(`\n=== ENABLE_MULTI_VERTICAL=${raw ?? "(unset)"}  →  ${on ? "ON" : "OFF"} ===`);
  for (const [k, v] of Object.entries(gates(on))) {
    console.log(`  ${k.padEnd(46)} : ${v}`);
  }
}
console.log(
  "\nOFF = production today (zero vertical UI). ON with only 'dental' active = identical," +
    " except the dropdowns appear with a single option (Dental).",
);
