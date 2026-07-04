import { notFound } from "next/navigation";
import { requireAdminContext } from "@/lib/admin/auth";
import { multiVerticalEnabled } from "@/lib/multi-vertical-access";
import { VerticalsTable, type VerticalRow } from "./verticals-table";

export const dynamic = "force-dynamic";

// Platform-owner view of the vertical catalog. Gated by ENABLE_MULTI_VERTICAL —
// 404 when off so it's invisible in production (same posture as any hidden admin
// route). Shows, per vertical, how much content is scoped specifically to it vs
// inherited from the shared (NULL) pool — so you can gauge how "ready" a niche is
// before flipping it active.
export default async function AdminVerticalsPage() {
  if (!multiVerticalEnabled()) notFound();

  // Re-verify super-admin (defense in depth) and get the service-role client.
  const { db } = await requireAdminContext();

  const [verticalsRes, postTypesRes, topicsRes] = await Promise.all([
    db.from("verticals").select("id, display_name, is_active").order("id", { ascending: true }),
    db.from("post_types").select("vertical"),
    db.from("topic_suggestions").select("vertical").eq("is_active", true),
  ]);

  // Tally: per-vertical specific counts + the shared (NULL) pool every vertical
  // falls back to.
  function tally(rows: { vertical?: string | null }[] | null) {
    const specific = new Map<string, number>();
    let shared = 0;
    for (const r of rows ?? []) {
      const v = r.vertical ?? null;
      if (v === null) shared += 1;
      else specific.set(v, (specific.get(v) ?? 0) + 1);
    }
    return { specific, shared };
  }
  const pt = tally(postTypesRes.data as { vertical?: string | null }[] | null);
  const tp = tally(topicsRes.data as { vertical?: string | null }[] | null);

  const rows: VerticalRow[] = (
    (verticalsRes.data as
      | { id: string; display_name: string; is_active: boolean }[]
      | null) ?? []
  ).map((v) => ({
    id: v.id,
    display_name: v.display_name,
    is_active: v.is_active,
    postTypesSpecific: pt.specific.get(v.id) ?? 0,
    topicsSpecific: tp.specific.get(v.id) ?? 0,
  }));

  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight text-text-primary">
        Verticals
      </h1>
      <p className="mt-1 text-[15px] text-text-secondary">
        Every vertical also inherits the shared pool — {pt.shared} content
        template{pt.shared === 1 ? "" : "s"} and {tp.shared} topic
        {tp.shared === 1 ? "" : "s"} tagged for all verticals (today&apos;s
        dental content). The counts below are what&apos;s scoped to each vertical
        on top of that.
      </p>
      <div className="mt-6">
        <VerticalsTable rows={rows} />
      </div>
    </div>
  );
}
