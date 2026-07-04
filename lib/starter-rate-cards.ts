// Per-vertical starter treatment catalog seeded for a NEW clinic at signup.
// Resolved by the clinic's vertical with a dental fallback (the code-level
// NULL/dental fallback). Dental is the exact set signup seeded before, so dental
// onboarding is unchanged. Prices are sensible ₹ starting points the clinic edits
// in Settings → Rate Cards. Onboarding a niche = add one entry here.

import { DEFAULT_VERTICAL } from "@/lib/vertical";

export type StarterRateCard = {
  treatment_name: string;
  category: string;
  base_price: number;
  duration_mins: number;
  recall_interval_days: number | null;
};

export const STARTER_RATE_CARDS: Record<string, StarterRateCard[]> = {
  dental: [
    { treatment_name: "Consultation", category: "Diagnostic", base_price: 300, duration_mins: 15, recall_interval_days: 180 },
    { treatment_name: "Scaling & Polishing", category: "Preventive", base_price: 1500, duration_mins: 45, recall_interval_days: 180 },
    { treatment_name: "Tooth Extraction", category: "Surgical", base_price: 1000, duration_mins: 30, recall_interval_days: null },
    { treatment_name: "RCT Single Sitting", category: "Endodontics", base_price: 4500, duration_mins: 60, recall_interval_days: 30 },
    { treatment_name: "RCT Multi Sitting", category: "Endodontics", base_price: 6000, duration_mins: 60, recall_interval_days: 30 },
    { treatment_name: "Composite Filling", category: "Restorative", base_price: 1200, duration_mins: 30, recall_interval_days: 365 },
    { treatment_name: "Crown Metal-Ceramic", category: "Prosthodontics", base_price: 4000, duration_mins: 45, recall_interval_days: null },
    { treatment_name: "Crown Zirconia", category: "Prosthodontics", base_price: 9000, duration_mins: 45, recall_interval_days: null },
    { treatment_name: "Teeth Whitening", category: "Cosmetic", base_price: 8000, duration_mins: 60, recall_interval_days: 365 },
    { treatment_name: "Dental Implant", category: "Implantology", base_price: 35000, duration_mins: 90, recall_interval_days: 90 },
  ],
  derma: [
    { treatment_name: "Consultation", category: "Diagnostic", base_price: 500, duration_mins: 15, recall_interval_days: 90 },
    { treatment_name: "Acne Treatment", category: "Medical", base_price: 1500, duration_mins: 30, recall_interval_days: 30 },
    { treatment_name: "Chemical Peel", category: "Procedure", base_price: 3000, duration_mins: 45, recall_interval_days: 30 },
    { treatment_name: "Laser Hair Reduction (per session)", category: "Laser", base_price: 2500, duration_mins: 45, recall_interval_days: 30 },
    { treatment_name: "Pigmentation Treatment", category: "Procedure", base_price: 3500, duration_mins: 45, recall_interval_days: 45 },
    { treatment_name: "PRP Hair Therapy (per session)", category: "Procedure", base_price: 4000, duration_mins: 60, recall_interval_days: 30 },
    { treatment_name: "Microneedling", category: "Procedure", base_price: 4000, duration_mins: 60, recall_interval_days: 30 },
    { treatment_name: "Mole / Wart Removal", category: "Procedure", base_price: 2000, duration_mins: 30, recall_interval_days: null },
    { treatment_name: "Laser Tattoo Removal (per session)", category: "Laser", base_price: 3000, duration_mins: 45, recall_interval_days: 30 },
    { treatment_name: "Follow-up Consultation", category: "Diagnostic", base_price: 300, duration_mins: 10, recall_interval_days: 30 },
  ],
  ortho: [
    { treatment_name: "Consultation", category: "Diagnostic", base_price: 500, duration_mins: 15, recall_interval_days: null },
    { treatment_name: "Follow-up Consultation", category: "Diagnostic", base_price: 300, duration_mins: 10, recall_interval_days: 30 },
    { treatment_name: "Physiotherapy Session", category: "Rehabilitation", base_price: 600, duration_mins: 45, recall_interval_days: 7 },
    { treatment_name: "Joint Injection", category: "Procedure", base_price: 2500, duration_mins: 30, recall_interval_days: null },
    { treatment_name: "PRP Injection (joint)", category: "Procedure", base_price: 8000, duration_mins: 30, recall_interval_days: 30 },
    { treatment_name: "Fracture Care / Casting", category: "Procedure", base_price: 3000, duration_mins: 45, recall_interval_days: 30 },
    { treatment_name: "Arthroscopy", category: "Surgery", base_price: 60000, duration_mins: 90, recall_interval_days: 90 },
    { treatment_name: "Knee Replacement", category: "Surgery", base_price: 150000, duration_mins: 120, recall_interval_days: 90 },
    { treatment_name: "Hip Replacement", category: "Surgery", base_price: 180000, duration_mins: 120, recall_interval_days: 90 },
    { treatment_name: "Digital X-ray", category: "Diagnostic", base_price: 500, duration_mins: 15, recall_interval_days: null },
  ],
  physio: [
    { treatment_name: "Assessment / Consultation", category: "Diagnostic", base_price: 600, duration_mins: 45, recall_interval_days: null },
    { treatment_name: "Physiotherapy Session", category: "Rehabilitation", base_price: 600, duration_mins: 45, recall_interval_days: 3 },
    { treatment_name: "Post-Surgery Rehab (per session)", category: "Rehabilitation", base_price: 800, duration_mins: 60, recall_interval_days: 3 },
    { treatment_name: "Sports Rehab (per session)", category: "Rehabilitation", base_price: 800, duration_mins: 60, recall_interval_days: 3 },
    { treatment_name: "Neuro Rehab (per session)", category: "Rehabilitation", base_price: 900, duration_mins: 60, recall_interval_days: 3 },
    { treatment_name: "Dry Needling", category: "Procedure", base_price: 700, duration_mins: 30, recall_interval_days: 7 },
    { treatment_name: "Cupping Therapy", category: "Procedure", base_price: 600, duration_mins: 30, recall_interval_days: 7 },
    { treatment_name: "Manual Therapy", category: "Rehabilitation", base_price: 700, duration_mins: 45, recall_interval_days: 7 },
    { treatment_name: "Home-Visit Physiotherapy", category: "Rehabilitation", base_price: 1200, duration_mins: 60, recall_interval_days: 3 },
    { treatment_name: "Follow-up Session", category: "Rehabilitation", base_price: 500, duration_mins: 30, recall_interval_days: 3 },
  ],
};

/** Starter rate cards for a vertical, dental fallback for unknown/absent. */
export function resolveStarterRateCards(vertical?: string | null): StarterRateCard[] {
  return STARTER_RATE_CARDS[vertical ?? ""] ?? STARTER_RATE_CARDS[DEFAULT_VERTICAL];
}
