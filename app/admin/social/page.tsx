import { requireAdminContext } from "@/lib/admin/auth";

// Thin admin tile for the Social Content Engine: per-clinic posts generated /
// approved / posted this calendar month + content-credit spend on generation.
// Cross-tenant reads via requireAdminContext (re-verifies super-admin first).
export const dynamic = "force-dynamic";

type Row = {
  clinic: string;
  generated: number;
  approved: number;
  posted: number;
  premium: number;
  credits: number;
};

export default async function AdminSocialPage() {
  const { db } = await requireAdminContext();

  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  // premium_visual lands with migration 046; re-query without it if unapplied.
  const POST_COLS = "clinic_id, status, credits_deducted, created_at";
  const [postsRes, { data: clinics }, { data: ledger }] = await Promise.all([
    db
      .from("social_posts")
      .select(`${POST_COLS}, premium_visual`)
      .gte("created_at", monthStart),
    db.from("clinics").select("id, business_name"),
    db
      .from("credit_ledger")
      .select("clinic_id, delta, kind, reason, created_at")
      .eq("kind", "content")
      .eq("reason", "generation")
      .gte("created_at", monthStart),
  ]);

  const posts = postsRes.error
    ? (await db.from("social_posts").select(POST_COLS).gte("created_at", monthStart)).data
    : postsRes.data;

  const names = new Map(
    (clinics ?? []).map((c) => [c.id as string, (c.business_name as string) ?? "—"]),
  );
  const byClinic = new Map<string, Row>();
  const rowFor = (id: string) => {
    let r = byClinic.get(id);
    if (!r) {
      r = { clinic: names.get(id) ?? id.slice(0, 8), generated: 0, approved: 0, posted: 0, premium: 0, credits: 0 };
      byClinic.set(id, r);
    }
    return r;
  };
  for (const p of (posts ?? []) as {
    clinic_id: string;
    status: string;
    premium_visual?: boolean;
  }[]) {
    const r = rowFor(p.clinic_id);
    r.generated++;
    if (p.status === "approved") r.approved++;
    if (p.status === "posted_manually") r.posted++;
    if (p.premium_visual) r.premium++;
  }
  for (const l of (ledger ?? []) as { clinic_id: string; delta: number }[]) {
    if (byClinic.has(l.clinic_id)) rowFor(l.clinic_id).credits += Math.abs(l.delta);
  }
  const rows = Array.from(byClinic.values()).sort((a, b) => b.generated - a.generated);
  const totals = rows.reduce(
    (t, r) => ({
      generated: t.generated + r.generated,
      approved: t.approved + r.approved,
      posted: t.posted + r.posted,
    }),
    { generated: 0, approved: 0, posted: 0 },
  );

  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-[-0.02em]">Social posts</h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        This month: {totals.generated} generated · {totals.approved} awaiting posting ·{" "}
        {totals.posted} posted manually.
      </p>
      {rows.length === 0 ? (
        <p className="mt-8 rounded-card border border-border bg-white p-8 text-center text-text-secondary">
          No social posts generated this month yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-card border border-border bg-white shadow-card">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-[0.08em] text-text-secondary">
                <th className="px-4 py-3">Clinic</th>
                <th className="px-4 py-3 text-right">Generated</th>
                <th className="px-4 py-3 text-right">Ready to post</th>
                <th className="px-4 py-3 text-right">Posted</th>
                <th className="px-4 py-3 text-right">✨ Premium visuals</th>
                <th className="px-4 py-3 text-right">Credits spent (all gen)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.clinic} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{r.clinic}</td>
                  <td className="px-4 py-3 text-right">{r.generated}</td>
                  <td className="px-4 py-3 text-right">{r.approved}</td>
                  <td className="px-4 py-3 text-right">{r.posted}</td>
                  <td className="px-4 py-3 text-right">{r.premium}</td>
                  <td className="px-4 py-3 text-right">{r.credits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
