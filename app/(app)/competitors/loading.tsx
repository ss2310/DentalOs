// Shown automatically (Suspense) while the server component re-fetches after
// "Analyze latest scan". Mirrors the page skeleton so the layout doesn't jump.
export default function Loading() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="h-8 w-40 rounded bg-subtle" />
      <div className="mt-2 h-4 w-72 rounded bg-subtle" />

      {/* Picker row */}
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="h-11 w-full rounded-button bg-subtle sm:max-w-xs" />
        <div className="h-11 w-44 rounded-button bg-subtle" />
      </div>

      {/* Stat cards */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-card border border-border bg-white p-5"
          >
            <div className="h-4 w-24 rounded bg-subtle" />
            <div className="mt-3 h-7 w-16 rounded bg-subtle" />
            <div className="mt-2 h-3 w-20 rounded bg-subtle" />
          </div>
        ))}
      </div>

      {/* Threat / table blocks */}
      <div className="mt-8 h-4 w-40 rounded bg-subtle" />
      <div className="mt-3 h-32 w-full rounded-card border border-border bg-white" />
      <div className="mt-8 h-4 w-40 rounded bg-subtle" />
      <div className="mt-3 h-48 w-full rounded-card border border-border bg-white" />
    </div>
  );
}
