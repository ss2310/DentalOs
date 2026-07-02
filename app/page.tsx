export default function Home() {
  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <span className="inline-flex items-center rounded-pill bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          GrowthOS
        </span>
        <h1 className="mt-4 text-2xl font-semibold text-text-primary">
          Practice management + AI marketing for dental clinics
        </h1>
        <p className="mt-3 text-text-secondary">
          Project scaffolded. See{" "}
          <code className="rounded bg-subtle px-1.5 py-0.5 text-sm">
            CLAUDE.md
          </code>{" "}
          for the design system, multi-tenancy, and messaging rules before
          building features.
        </p>

        <div className="mt-8 rounded-card border border-border bg-white p-5">
          <p className="text-sm uppercase tracking-wide text-text-secondary">
            Next steps
          </p>
          <ul className="mt-3 space-y-2 text-text-primary">
            <li>Connect Supabase (Postgres, Auth, RLS)</li>
            <li>Build the practice management layer</li>
            <li>Add the AI content generation route</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
