// Row shapes for the tables this module reads. `numeric` columns arrive from
// Supabase as strings, hence the string types on money fields.

export type Patient = {
  id: string;
  full_name: string;
  whatsapp_number: string | null;
  phone: string | null;
  date_of_birth: string | null;
  gender: string | null;
  area: string | null;
  notes: string | null;
  total_visits: number;
  lifetime_revenue: string;
  total_outstanding: string;
  last_visit_date: string | null;
  created_at: string;
};

export type VisitLog = {
  id: string;
  visit_date: string;
  treatment_name_text: string;
  cost: string;
  amount_paid: string;
  payment_status: "paid" | "partial" | "pending";
  doctor: string | null;
};

export type CasePipeline = {
  id: string;
  plan_value: string;
  stage: string;
  follow_up_date: string | null;
  treatment_id: string | null;
};

export type Recall = {
  id: string;
  recall_type: string;
  due_date: string;
  status: string;
};

export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "arrived"
  | "in_chair"
  | "completed"
  | "no_show"
  | "cancelled_patient"
  | "rescheduled"
  | "recovery_sent";

export type AppointmentRow = {
  id: string;
  patient_id: string;
  appointment_date: string;
  appointment_time: string;
  treatment_type_id: string | null;
  doctor: string | null;
  status: AppointmentStatus;
  notes: string | null;
  reminder_24h_sent_at: string | null;
  reminder_1h_sent_at: string | null;
  recovery_sent_at: string | null;
  review_requested: boolean;
  patient: { full_name: string; whatsapp_number: string | null } | null;
  treatment: { treatment_name: string } | null;
};

export type PatientOption = {
  id: string;
  full_name: string;
  whatsapp_number: string | null;
  phone: string | null;
};

// ---- Voice notes (migration 023) + extraction agent (migration 024) ----
export type ClinicNoteStatus =
  | "processing"
  | "pending_review"
  | "confirmed"
  | "failed";

// Mirrors the recall_type enum in 001_init.sql.
export const RECALL_TYPES = [
  "general_checkup",
  "cleaning",
  "follow_up",
  "ortho_adjustment",
] as const;
export type RecallType = (typeof RECALL_TYPES)[number];

// The staged, human-editable proposal the extraction agent produces. Held on
// clinic_notes.extraction until Confirm materializes it into followup_tasks /
// recalls. Client-safe (no server-only imports) so the note card can render it.
export type NoteExtraction = {
  cleaned_note: string;
  tags: string[];
  followups: { description: string; due_date: string | null }[];
  recall: { recall_type: RecallType; due_date: string } | null;
  // A proposed appointment booking. date = YYYY-MM-DD, time = HH:MM (24h).
  appointment: { date: string; time: string; reason: string | null } | null;
  review_requested: boolean;
};

export type ClinicNote = {
  id: string;
  patient_id: string | null;
  raw_transcript: string | null;
  note_text: string | null;
  tags: string[];
  status: ClinicNoteStatus;
  extraction: NoteExtraction | null;
  audio_path: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
};

export type FollowupTask = {
  id: string;
  note_id: string | null;
  patient_id: string | null;
  description: string;
  due_date: string | null;
  status: "open" | "done";
  created_at: string;
};

// numeric columns arrive from Supabase as strings.
export type RankKeyword = {
  id: string;
  keyword: string;
  target_business_name: string;
  target_place_id: string | null;
  center_lat: string;
  center_lng: string;
  grid_size: number;
  radius_km: string;
  is_active: boolean;
  created_at: string;
};

export type GridScanPoint = { lat: number; lng: number; rank: number | null };

// ---- Competitor intelligence (stored on rank_scans.competitors) ----
// Computed at scan time from the top-10 local results the SERP provider already
// returns per grid point, so the /competitors feature costs no extra API calls.

/** One rival business aggregated across all grid points of a scan. */
export type CompetitorRow = {
  name: string;
  avg_rank: number | null; // mean rank across cells where they appear
  reviews_count: number | null; // richest listing seen
  rating: number | null;
  has_website: boolean;
  cells_beating_target: number; // cells where they outrank you (or you're absent)
  cells_present: number; // cells where they appear at all
  top3_cells: number; // cells where they sit in the local top-3
};

/** The clinic's own profile within the same scan (the "you" baseline). */
export type CompetitorTarget = {
  avg_rank: number | null;
  reviews_count: number | null;
  rating: number | null;
  has_website: boolean;
  top3_cells: number;
};

/** Per-cell gap-map classification, in the scan's grid order. */
export type CompetitorCell = {
  lat: number;
  lng: number;
  your_rank: number | null;
  leader_name: string | null; // best-ranked rival at this cell
  // win: you're top-3 here · behind: present but a rival leads ·
  // absent: you're missing while rivals rank · empty: no data at this cell
  state: "win" | "behind" | "absent" | "empty";
};

export type CompetitorSummary = {
  total_cells: number;
  target: CompetitorTarget;
  rivals: CompetitorRow[]; // sorted by cells_beating_target desc
  total_top3_slots: number; // denominator for share-of-local-pack
  cells: CompetitorCell[];
};

export type RankScan = {
  id: string;
  keyword_id: string;
  scanned_at: string;
  avg_rank: string | null;
  pct_in_top3: string | null;
  grid_points: GridScanPoint[] | null;
  provider: string | null;
  requests_made: number;
  created_at: string;
  // Present on scans created from migration 008 onward; null on older scans.
  competitors?: CompetitorSummary | null;
};

export type RateCardOption = {
  id: string;
  treatment_name: string;
};

// ---- Agency prospecting (prospect_audits, agency-scoped) ----
// A cold audit of a NON-client business. Reuses the same competitor aggregate
// shape as the clinic-facing feature (CompetitorSummary) plus plain-English
// findings and an optional AI-visibility summary (populated later by R4).

export type AiVisibilityEngineResult = {
  engine: string; // 'chatgpt' | 'gemini' | 'perplexity' | 'google_ai_overview'
  is_cited: boolean;
  is_mentioned?: boolean;
  note?: string | null;
  // Enriched by the check-session tie-in (buildProspectSummary); the R3 report
  // ignores unknown fields, so these are safe to include.
  checked?: number;
  cited?: number;
};

export type AiVisibilitySummary = {
  engines: AiVisibilityEngineResult[];
  checked_at?: string;
  // 2–3 plain-English gap lines, rendered under the report's AI section.
  findings?: string[];
};

// numeric columns arrive from Supabase as strings.
export type ProspectAudit = {
  id: string;
  business_name: string | null;
  area: string | null;
  city: string | null;
  keyword: string | null;
  center_lat: string | null;
  center_lng: string | null;
  grid_points: GridScanPoint[] | null;
  avg_rank: string | null;
  pct_in_top3: string | null;
  competitors: CompetitorSummary | null;
  findings: string[] | null;
  ai_visibility_summary: AiVisibilitySummary | null;
  share_token: string;
  provider: string | null;
  requests_made: number;
  created_at: string;
};

// What the anon get_prospect_audit_by_token() RPC returns — no id/share_token
// or owner fields, so a leaked token exposes only the report itself.
export type PublicAudit = {
  business_name: string | null;
  area: string | null;
  city: string | null;
  keyword: string | null;
  center_lat: string | null;
  center_lng: string | null;
  grid_points: GridScanPoint[] | null;
  avg_rank: string | null;
  pct_in_top3: string | null;
  competitors: CompetitorSummary | null;
  findings: string[] | null;
  ai_visibility_summary: AiVisibilitySummary | null;
  created_at: string;
};
