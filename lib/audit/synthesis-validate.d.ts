// Types for the pure synthesis validator (synthesis-validate.mjs).

export interface PlanItemJson {
  day_number: number;
  title: string;
  description: string;
  evidence: string;
  competitor_context: string;
  metric_keys: string[];
  effort: "15-min" | "1-hour" | "needs-help";
}

export interface SynthesisJson {
  headline: string;
  competitor_story: string[];
  plan: PlanItemJson[];
}

export function validateSynthesis(
  json: unknown,
  opts: {
    eligibleMetricKeys: string[];
    metricToMoat: Record<string, string>;
    gapOrder: string[];
    minItems?: number;
    maxItems?: number;
    themeCap?: number;
    quickWinBy?: number;
    topGapBy?: number;
  },
): { ok: true; plan: PlanItemJson[] } | { ok: false; reason: string };
