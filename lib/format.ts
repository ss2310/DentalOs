// Locale-aware formatting helpers (see CLAUDE.md: ₹ INR, DD MMM YYYY).
// Postgres `numeric` comes back from Supabase as a string, so these accept
// string | number and coerce defensively.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatINR(value: number | string | null | undefined): string {
  const n = Number(value ?? 0) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Formats a 'YYYY-MM-DD' (or ISO) date as e.g. "03 Jul 2026". */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  // Anchor to midday to avoid any timezone date-shift on date-only strings.
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Whole-year age from a 'YYYY-MM-DD' DOB, or null if missing/invalid. */
export function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(`${dob.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}
