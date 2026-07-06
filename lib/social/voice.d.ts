export type ProofPoint = {
  claim: string;
  source: string | null;
  status: "verified" | "unverified";
};

export type LanguageChoice = "english" | "hindi" | "hinglish";

export type VoiceProfile = {
  id?: string;
  identity_line: string;
  audience?: string | null;
  tone_friendly: number;
  tone_conversational: number;
  language_mix: Partial<Record<"instagram" | "facebook" | "gbp", LanguageChoice>>;
  banned_phrases: string[];
  required_disclaimers: string[];
  cta_preference: "whatsapp" | "call" | "walkin";
  proof_points: Array<{ claim?: string; source?: string | null; status?: string }>;
  source?: "wizard" | "default";
};

export type ClinicLike = {
  business_name?: string | null;
  doctor_name?: string | null;
  area?: string | null;
  city?: string | null;
  phone?: string | null;
};

export function normalizeProofPoint(raw: unknown): ProofPoint | null;
export function verifiedProofPoints(
  proofPoints: unknown[] | null | undefined,
): ProofPoint[];
export function buildVoiceContext(
  profile: VoiceProfile,
  clinic: ClinicLike,
  platform: "instagram" | "facebook" | "gbp" | null,
): string;
export function languageLabel(
  profile: VoiceProfile,
  platform: "instagram" | "facebook" | "gbp",
): string;
export function buildDefaultProfile(
  clinic: ClinicLike,
  verticalRules?: { bannedPhrases?: string[]; disclaimers?: string[] },
): VoiceProfile;
