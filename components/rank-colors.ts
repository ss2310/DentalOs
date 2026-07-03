// Heatmap rank → colour mapping (shared by the client heatmap and any server
// page that renders trend bars, so it lives in a plain module).
//   1–3 green · 4–7 light-green · 8–10 yellow · 11–15 orange · 16–20 red ·
//   not found (null / >20) grey.

export function rankColor(rank: number | null): string {
  if (rank == null || rank > 20 || rank < 1) return "#E5E7EB"; // grey
  if (rank <= 3) return "#059669"; // success green
  if (rank <= 7) return "#86EFAC"; // light green
  if (rank <= 10) return "#FDE047"; // yellow
  if (rank <= 15) return "#FB923C"; // orange
  return "#DC2626"; // red
}

// Readable text colour on top of the cell colour above.
export function rankTextColor(rank: number | null): string {
  if (rank == null || rank > 20 || rank < 1) return "#6B7280"; // grey cell → muted
  if (rank <= 3) return "#FFFFFF";
  if (rank <= 10) return "#111827"; // light-green / yellow → dark text
  return "#FFFFFF"; // orange / red → white
}
