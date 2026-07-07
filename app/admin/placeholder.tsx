// Shared "coming later" panel for admin sections that are nav-only in this
// foundation (Subscriptions, Usage & Costs, System).
export function AdminPlaceholder({
  title,
  note,
}: {
  title: string;
  note: string;
}) {
  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text-primary">
        {title}
      </h1>
      <div className="mt-5 rounded-card border border-dashed border-border bg-white p-10 text-center">
        <p className="text-[15px] text-text-secondary">{note}</p>
      </div>
    </div>
  );
}
