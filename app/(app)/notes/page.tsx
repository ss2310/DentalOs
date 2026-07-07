import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { voiceNotesEnabledForClinic } from "@/lib/voice-notes-access";
import { formatRelativeTime, addDays } from "@/lib/format";
import { NOTE_STATUS, isNoteStatus } from "@/lib/note-status";
import { PageHeader, EmptyState } from "@/components/page";
import { NotesFilterBar } from "@/components/notes-filter-bar";
import type { ClinicNoteStatus, NoteExtraction } from "@/lib/types";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_LIMIT = 100;

type NoteRow = {
  id: string;
  patient_id: string | null;
  note_text: string | null;
  raw_transcript: string | null;
  tags: string[] | null;
  status: ClinicNoteStatus;
  extraction: NoteExtraction | null;
  created_at: string;
  patient: { full_name: string } | null;
};

// Compact read-only summary of the staged/confirmed proposal for the inbox card.
function extractionPills(ex: NoteExtraction | null): string[] {
  if (!ex) return [];
  const pills: string[] = [];
  const n = ex.followups?.length ?? 0;
  if (n > 0) pills.push(`${n} follow-up${n === 1 ? "" : "s"}`);
  if (ex.recall) pills.push("Recall");
  if (ex.appointment) pills.push("Appointment");
  if (ex.review_requested) pills.push("Review requested");
  return pills;
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: { status?: string; date?: string; q?: string; patient?: string };
}) {
  const supabase = createClient();

  // Flag gate. 404 (not 403/redirect) so a disabled feature isn't advertised —
  // same posture as the nav, which hides the link entirely.
  const { data: clinic } = await supabase
    .from("clinics")
    .select("feature_flags")
    .single();
  if (!voiceNotesEnabledForClinic(clinic?.feature_flags)) notFound();

  const status =
    searchParams.status && isNoteStatus(searchParams.status)
      ? searchParams.status
      : "all";
  const date = DATE_RE.test(searchParams.date ?? "") ? searchParams.date! : "";
  const q = (searchParams.q ?? "").trim();
  const patientId = (searchParams.patient ?? "").trim();

  // A name search resolves to patient ids first. No match ⇒ short-circuit to an
  // empty result rather than issuing an `in.()` with no ids.
  let nameIds: string[] | null = null;
  if (q) {
    const { data: matched } = await supabase
      .from("patients")
      .select("id")
      .ilike("full_name", `%${q}%`)
      .limit(200);
    nameIds = (matched ?? []).map((r) => r.id as string);
  }

  // If we're scoped to one patient (profile deep-link), fetch their name for the
  // filter chip.
  let patientName: string | null = null;
  if (patientId) {
    const { data: p } = await supabase
      .from("patients")
      .select("full_name")
      .eq("id", patientId)
      .maybeSingle();
    patientName = p?.full_name ?? null;
  }

  let rows: NoteRow[] = [];
  if (!(q && nameIds && nameIds.length === 0)) {
    let query = supabase
      .from("clinic_notes")
      .select(
        "id, patient_id, note_text, raw_transcript, tags, status, extraction, created_at, patient:patient_id(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(PAGE_LIMIT);

    if (status !== "all") query = query.eq("status", status);
    if (patientId) query = query.eq("patient_id", patientId);
    if (nameIds) query = query.in("patient_id", nameIds);
    if (date) {
      query = query
        .gte("created_at", `${date}T00:00:00+05:30`)
        .lt("created_at", `${addDays(date, 1)}T00:00:00+05:30`);
    }

    const { data } = await query;
    rows = (data as unknown as NoteRow[]) ?? [];
  }

  // Overall "to review" tally for the subtitle — independent of the active
  // filters so it always reflects the real backlog.
  const { count: reviewCount } = await supabase
    .from("clinic_notes")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");

  const filtersActive = status !== "all" || Boolean(date) || Boolean(q);

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle={
          reviewCount && reviewCount > 0
            ? `${reviewCount} note${reviewCount === 1 ? "" : "s"} to review`
            : "Every voice note across the clinic, newest first"
        }
      />

      {patientId ? (
        <div className="mt-4 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-pill bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            {patientName ? `Patient: ${patientName}` : "One patient"}
            <Link
              href="/notes"
              aria-label="Clear patient filter"
              className="text-primary/70 hover:text-primary"
            >
              ✕
            </Link>
          </span>
        </div>
      ) : null}

      <NotesFilterBar status={status} date={date} q={q} />

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState>
            {filtersActive || patientId
              ? "No notes match these filters."
              : "No voice notes yet. Record one from a patient profile or the 🎙️ button in the header."}
          </EmptyState>
        ) : (
          <div className="space-y-3">
            {rows.map((n) => {
              const badge = NOTE_STATUS[n.status];
              const preview = (n.note_text || n.raw_transcript || "").trim();
              const pills = extractionPills(n.extraction);
              const tags = Array.isArray(n.tags) ? n.tags : [];
              return (
                <div
                  key={n.id}
                  className="rounded-card border border-border bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.patient_id ? (
                          <Link
                            href={`/patients/${n.patient_id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            {n.patient?.full_name ?? "Patient"}
                          </Link>
                        ) : (
                          <span className="font-semibold text-text-primary">
                            General note
                          </span>
                        )}
                        <span
                          className={`rounded-pill px-2.5 py-1 text-xs font-medium ${badge.badge}`}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <p
                        className="mt-1 text-xs text-text-secondary"
                        title={n.created_at}
                      >
                        {formatRelativeTime(n.created_at)}
                      </p>
                    </div>
                    {n.status === "pending_review" && n.patient_id ? (
                      <Link
                        href={`/patients/${n.patient_id}`}
                        className="shrink-0 text-sm font-medium text-primary hover:underline"
                      >
                        Review →
                      </Link>
                    ) : null}
                  </div>

                  {preview ? (
                    <p className="mt-2 line-clamp-2 text-sm text-text-secondary">
                      {preview}
                    </p>
                  ) : null}

                  {pills.length > 0 || tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {pills.map((p) => (
                        <span
                          key={p}
                          className="rounded-pill bg-subtle px-2.5 py-1 text-xs font-medium text-text-secondary"
                        >
                          {p}
                        </span>
                      ))}
                      {tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-pill bg-subtle px-2.5 py-1 text-xs text-text-secondary"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {rows.length === PAGE_LIMIT ? (
              <p className="pt-1 text-center text-xs text-text-secondary">
                Showing the {PAGE_LIMIT} most recent — narrow with the filters
                above to see older notes.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
