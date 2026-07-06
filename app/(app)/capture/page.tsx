import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page";
import { CaptureClient } from "./capture-client";

// Moment Capture (S1) — the chairside flow: snap → who → consent → save →
// one-tap review ask. Staff-usable (receptionists included); mobile-first.
export const dynamic = "force-dynamic";

export default async function CapturePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: clinic }, { data: patients }, { data: cards }] = await Promise.all([
    supabase.from("clinics").select("google_review_url").single(),
    supabase
      .from("patients")
      .select("id, full_name, whatsapp_number, phone")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("rate_cards")
      .select("treatment_name")
      .eq("is_active", true)
      .order("treatment_name"),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Capture a moment"
        subtitle="Snap the result, record consent, ask for a review — 60 seconds."
        action={
          <Link
            href="/capture/gallery"
            className="flex h-11 items-center rounded-button border border-border bg-white px-4 text-[15px] font-medium hover:border-primary/40"
          >
            Gallery
          </Link>
        }
      />
      <CaptureClient
        patients={(patients ?? []).map((p) => ({
          id: p.id as string,
          name: (p.full_name as string) ?? "",
          phone: (p.whatsapp_number as string) ?? (p.phone as string) ?? "",
        }))}
        treatments={(cards ?? []).map((c) => c.treatment_name as string).filter(Boolean)}
        reviewUrl={(clinic?.google_review_url as string) ?? null}
      />
    </div>
  );
}
