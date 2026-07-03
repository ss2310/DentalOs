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

/** Formats a 'HH:MM:SS' (or 'HH:MM') time as e.g. "9:30 AM". */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const [hStr, mStr] = value.split(":");
  let h = Number(hStr);
  const m = mStr ?? "00";
  if (Number.isNaN(h)) return "—";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m.padStart(2, "0")} ${ampm}`;
}

/** Current date + time in IST (Asia/Kolkata) as 'YYYY-MM-DD' / 'HH:MM:SS'. */
export function nowIST(): { date: string; time: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);
  return { date, time };
}

/** Adds n days to a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD'. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Compact relative time from a timestamp, e.g. "just now", "3h ago", "2d ago". */
export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.floor((Date.now() - then) / 1000);
  if (secs < 45) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return formatDate(value);
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
