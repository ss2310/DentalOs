// Shown whenever the Map Rank data source is the built-in `mock` provider, so
// no one mistakes made-up sample ranks for real Google results.
export function SampleDataBanner() {
  return (
    <div className="mt-4 rounded-card border border-warning/30 bg-warning/5 p-4">
      <p className="text-sm font-semibold text-warning">Sample data — not real ranks</p>
      <p className="mt-1 text-sm text-text-primary">
        Map Rank is running on the built-in demo source, so every rank below is a
        made-up example, not a real Google Maps result. Before showing this to
        anyone, switch on live data: set <code>SERP_PROVIDER=serper</code> and a{" "}
        <code>SERPER_API_KEY</code> in the environment (see HANDOFF §10), then
        restart the app.
      </p>
    </div>
  );
}
