// Types for the pure synthesis input builder (synthesis-input.mjs).
import type { MoatScore } from "./scoring";

export type SignalValue = number | boolean | string | null;

export interface RivalInput {
  name: string;
  scores: MoatScore[];
  values: Record<string, SignalValue>;
}

export interface PriorInput {
  plan_completed: number;
  plan_total: number;
  avg_prev: number | null;
  avg_now: number | null;
  visibility_prev: number | null;
  visibility_now: number | null;
}

export interface SynthesisPayload {
  clinic: { name: string; area: string; city: string };
  competitors: string[];
  gaps: {
    moat_key: string;
    moat_name: string;
    weight_pct: number;
    weighted_gap: number;
    self_score: number;
    competitor: { name: string; score: number | null } | null;
    signals: {
      metric_key: string;
      label: string;
      self: SignalValue;
      competitor: SignalValue;
    }[];
  }[];
  prior: PriorInput | null;
}

export function buildSynthesisPayload(args: {
  selfScores: MoatScore[];
  rivals: RivalInput[];
  moatConfig: { moat_key: string; display_name: string; weight_pct: number }[];
  metricsByMoat: Record<string, { metric_key: string; label: string }[]>;
  selfValues: Record<string, SignalValue>;
  clinic: { name?: string; area?: string; city?: string };
  prior?: PriorInput | null;
}): {
  payload: SynthesisPayload;
  eligibleMetricKeys: string[];
  metricToMoat: Record<string, string>;
  gapOrder: string[];
};
