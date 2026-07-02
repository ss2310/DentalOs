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
