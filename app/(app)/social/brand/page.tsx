import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserRole, isAdminRole } from "@/lib/roles";
import { buildDefaultProfile } from "@/lib/social/voice";
import { loadComplianceRules } from "@/lib/social/generate";
import { DEFAULT_VERTICAL } from "@/lib/vertical";
import { PageHeader } from "@/components/page";
import { BrandWizardClient } from "./wizard-client";

// "Brand Personality" (UI name — clinic_voice_profiles underneath) + brand kit.
// The wizard walks 6 questions across 3 screens; Skip uses a safe default built
// from the clinic record + vertical config (the engine also self-heals: it
// creates that default on first generation if nothing is active).
export const dynamic = "force-dynamic";

export default async function BrandPage() {
  if (!isAdminRole(await getUserRole())) redirect("/dashboard");
  const supabase = createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("id, business_name, doctor_name, area, city, phone, vertical")
    .single();
  if (!clinic) redirect("/dashboard");

  const [{ data: active }, { data: kit }, rules] = await Promise.all([
    supabase
      .from("clinic_voice_profiles")
      .select(
        "identity_line, audience, tone_friendly, tone_conversational, language_mix, banned_phrases, cta_preference, proof_points, version, source",
      )
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("clinic_brand_kits")
      .select("primary_color, secondary_color, font, logo_path")
      .maybeSingle(),
    loadComplianceRules(supabase, clinic.vertical ?? DEFAULT_VERTICAL),
  ]);

  const fallback = buildDefaultProfile(clinic, {
    bannedPhrases: [],
    disclaimers: rules.disclaimers,
  });
  const initial = active ?? fallback;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Brand Personality"
        subtitle="Six quick questions so every post sounds like YOUR clinic — not a template."
      />
      <BrandWizardClient
        initial={{
          identity_line: initial.identity_line ?? "",
          audience: initial.audience ?? "",
          tone_friendly: initial.tone_friendly ?? 60,
          tone_conversational: initial.tone_conversational ?? 55,
          language_mix: {
            instagram: (initial.language_mix as Record<string, string>)?.instagram ?? "hinglish",
            facebook: (initial.language_mix as Record<string, string>)?.facebook ?? "english",
            gbp: (initial.language_mix as Record<string, string>)?.gbp ?? "english",
          },
          banned_phrases: (initial.banned_phrases as string[]) ?? [],
          cta_preference:
            (initial.cta_preference as "whatsapp" | "call" | "walkin") ?? "whatsapp",
          proof_points: ((initial.proof_points as { claim?: string; source?: string }[]) ?? [])
            .map((p) => ({ claim: p.claim ?? "", source: p.source ?? "" })),
        }}
        clinic={{
          name: clinic.business_name ?? "",
          doctor: clinic.doctor_name ?? "",
          area: clinic.area ?? "",
          city: clinic.city ?? "",
          phone: clinic.phone ?? "",
        }}
        hasProfile={!!active}
        kit={{
          primary_color: kit?.primary_color ?? "#0D9488",
          secondary_color: kit?.secondary_color ?? "#1D1D1F",
          font: (kit?.font as string) ?? "inter",
          hasLogo: !!kit?.logo_path,
        }}
      />
    </div>
  );
}
