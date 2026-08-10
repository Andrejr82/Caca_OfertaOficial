export const TREND_LIFECYCLE_STATUSES = [
  "discovered",
  "matched",
  "recommended",
  "approved",
  "active",
  "measuring",
  "completed",
  "scaled",
  "adjusted",
  "aborted"
] as const;

export const TREND_SOURCE_TYPES = ["internal", "external", "manual"] as const;

export type TrendLifecycleStatus = (typeof TREND_LIFECYCLE_STATUSES)[number];
export type TrendSourceType = (typeof TREND_SOURCE_TYPES)[number];
export type TrendChannel = "telegram" | "instagram" | "whatsapp" | "facebook" | "other";
export type TrendDirection = "rising" | "stable" | "falling";

export interface TrendSignal {
  id: string;
  sourceType: TrendSourceType;
  sourceName: string;
  source: string;
  region: string;
  externalId: string | null;
  term: string;
  title: string;
  evidence: Record<string, unknown>;
  observedAt: string;
  capturedAt: string;
  trendStrength: number | null;
  trendDirection: TrendDirection;
  offerId: string | null;
}

export interface TrendOpportunity {
  id: string;
  signalId: string;
  offerId: string | null;
  score: number | null;
  status: TrendLifecycleStatus;
  experimentId: string | null;
  strategyVersion: string;
  finalDecision: string | null;
}

export interface TrendRecommendation {
  id: string;
  opportunityId: string;
  offerId: string;
  channel: TrendChannel | null;
  format: string | null;
  justification: string | null;
  hypothesis: string | null;
  status: TrendLifecycleStatus;
}

export interface TrendExperiment {
  id: string;
  opportunityId: string;
  windowDays: 7;
  strategyVersion: string;
  status: TrendLifecycleStatus;
  finalDecision: string | null;
}

export interface TrendOpportunityListItem extends TrendOpportunity {
  signalTitle: string;
  recommendation: Pick<TrendRecommendation, "offerId" | "channel" | "format" | "justification" | "hypothesis"> | null;
}
