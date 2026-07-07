import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildQueryTemplates, ENGINE_KEYS } from "@/lib/ai-visibility";
import { SessionStepper, type Combo } from "../../../ai-visibility/session-stepper";

export const dynamic = "force-dynamic";

// Prospect check sessions run in-memory (a prospect has no clinic_id, so nothing
// is written to ai_visibility_checks). On finish, the stepper writes a compact
// summary to prospect_audits.ai_visibility_summary via saveProspectAiSummary,
// which lights up the public audit report's AI-search section.
export default async function ProspectAiVisibilityPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_agency")
    .eq("id", user.id)
    .single();
  if (!profile?.is_agency) redirect("/dashboard");

  // Read `vertical` defensively: if migration 028 isn't applied, re-query without
  // it so the check still works (behaves as dental — unchanged).
  const auditRes = await supabase
    .from("prospect_audits")
    .select("id, business_name, area, city, vertical")
    .eq("id", params.id)
    .maybeSingle();
  const audit = auditRes.error
    ? (
        await supabase
          .from("prospect_audits")
          .select("id, business_name, area, city")
          .eq("id", params.id)
          .maybeSingle()
      ).data
    : auditRes.data;
  if (!audit) notFound();

  const combos: Combo[] = buildQueryTemplates(
    {
      name: audit.business_name,
      area: audit.area,
      city: audit.city,
    },
    (audit as { vertical?: string | null }).vertical,
  ).flatMap((t, qi) =>
    ENGINE_KEYS.map((engine) => ({
      query_id: `t${qi}`, // synthetic — not persisted for prospects
      query_text: t.query_text,
      engine,
    })),
  );

  return (
    <div>
      <h1 className="font-display text-[22px] font-semibold text-text-primary">
        AI Visibility check — {audit.business_name ?? "prospect"}
      </h1>
      <p className="mb-5 mt-1 text-sm text-text-secondary">
        Ask each query in each engine and mark whether this business is cited. On
        finish, a summary is written to the audit&apos;s public report.
      </p>
      <SessionStepper
        combos={combos}
        mode="prospect"
        auditId={audit.id}
        backHref={`/prospect/${audit.id}`}
        backLabel="Back to audit"
      />
    </div>
  );
}
