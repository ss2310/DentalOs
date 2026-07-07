import type { CompetitorRow, CompetitorTarget } from "@/lib/types";
import { EmptyState } from "@/components/page";

// Shared "You vs Competitors" table. Used by the clinic-facing /competitors
// page, the agency audit detail, and the public prospect report — one component
// so the comparison always reads identically. Pure/server (no hooks).
//
// `you` is the label for the pinned baseline row: "You (Clinic)" in the clinic
// app, or the prospect's own business name in an agency audit.

const num = (n: number | null, digits = 1) =>
  n == null ? "—" : n.toFixed(digits);
const int = (n: number | null) => (n == null ? "—" : String(n));

export function CompetitorTable({
  target,
  rivals,
  total,
  youLabel,
}: {
  target: CompetitorTarget;
  rivals: CompetitorRow[];
  total: number;
  youLabel: string;
}) {
  if (rivals.length === 0) {
    return (
      <EmptyState>No competitors appeared in this scan&apos;s results.</EmptyState>
    );
  }

  const th =
    "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-secondary";
  const td = "px-3 py-3 text-[15px] text-text-primary";

  return (
    <>
      {/* Desktop: aligned table */}
      <div className="hidden overflow-hidden rounded-card border border-border bg-white sm:block">
        <table className="w-full border-collapse">
          <thead className="border-b border-border bg-subtle">
            <tr>
              <th className={th}>Business</th>
              <th className={th}>Avg rank</th>
              <th className={th}>Reviews</th>
              <th className={th}>Rating</th>
              <th className={th}>Website</th>
              <th className={th}>Beats you</th>
            </tr>
          </thead>
          <tbody>
            {/* Pinned baseline row */}
            <tr className="border-b border-primary/20 bg-primary/5">
              <td className={`${td} font-semibold text-primary`}>{youLabel}</td>
              <td className={td}>{num(target.avg_rank)}</td>
              <td className={td}>{int(target.reviews_count)}</td>
              <td className={td}>{num(target.rating)}</td>
              <td className={td}>{target.has_website ? "Yes" : "No"}</td>
              <td className={`${td} text-text-secondary`}>—</td>
            </tr>
            {rivals.map((r) => (
              <tr key={r.name} className="border-b border-border last:border-0">
                <td className={`${td} font-medium`}>{r.name}</td>
                <td className={td}>{num(r.avg_rank)}</td>
                <td className={td}>
                  {reviewsCell(r.reviews_count, target.reviews_count)}
                </td>
                <td className={td}>{ratingCell(r.rating, target.rating)}</td>
                <td className={td}>
                  {websiteCell(r.has_website, target.has_website)}
                </td>
                <td className={td}>
                  <span
                    className={
                      r.cells_beating_target > 0
                        ? "font-semibold text-danger"
                        : ""
                    }
                  >
                    {r.cells_beating_target}/{total}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: stacked cards, baseline card pinned + highlighted */}
      <div className="space-y-3 sm:hidden">
        <div className="rounded-card border border-primary/30 bg-primary/5 p-4">
          <p className="text-[15px] font-semibold text-primary">{youLabel}</p>
          <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
            <MobileField label="Avg rank" value={num(target.avg_rank)} />
            <MobileField label="Reviews" value={int(target.reviews_count)} />
            <MobileField label="Rating" value={num(target.rating)} />
            <MobileField
              label="Website"
              value={target.has_website ? "Yes" : "No"}
            />
          </dl>
        </div>
        {rivals.map((r) => (
          <div
            key={r.name}
            className="rounded-card border border-border bg-white p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-[15px] font-medium text-text-primary">
                {r.name}
              </p>
              <span
                className={`shrink-0 text-sm ${
                  r.cells_beating_target > 0
                    ? "font-semibold text-danger"
                    : "text-text-secondary"
                }`}
              >
                beats you {r.cells_beating_target}/{total}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
              <MobileField label="Avg rank" value={num(r.avg_rank)} />
              <MobileField
                label="Reviews"
                value={reviewsCell(r.reviews_count, target.reviews_count)}
              />
              <MobileField
                label="Rating"
                value={ratingCell(r.rating, target.rating)}
              />
              <MobileField
                label="Website"
                value={websiteCell(r.has_website, target.has_website)}
              />
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}

function MobileField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-text-secondary">
        {label}
      </dt>
      <dd className="text-text-primary">{value}</dd>
    </div>
  );
}

function reviewsCell(them: number | null, you: number | null) {
  const more = them != null && (you == null || them > you);
  return (
    <span className={more ? "font-semibold text-danger" : ""}>
      {int(them)}
      {more ? " ▲" : ""}
    </span>
  );
}

function ratingCell(them: number | null, you: number | null) {
  const better = them != null && (you == null || them > you);
  return (
    <span className={better ? "font-semibold text-danger" : ""}>
      {num(them)}
    </span>
  );
}

function websiteCell(them: boolean, you: boolean) {
  if (them !== you) {
    const hurts = them && !you;
    return (
      <span className={hurts ? "font-medium text-danger" : "text-warning"}>
        ⚠ {them ? "Yes" : "No"}
      </span>
    );
  }
  return <span>{them ? "Yes" : "No"}</span>;
}
