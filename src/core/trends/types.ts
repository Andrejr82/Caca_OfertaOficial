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
export type TrendCommercialDecision = "eligible" | "rejected";
export type TrendMatchStatus = "matched" | "no_match";

export interface TrendDirectEvidence {
  claim: string;
  evidence_type: string | null;
  source_url: string | null;
  observed_at: string | null;
  rank_position: number | null;
  best_seller_flag: boolean | null;
  trending_flag: boolean | null;
  sold_quantity: number | null;
  price: number | null;
  old_price: number | null;
  discount_percent: number | null;
  rating: number | null;
  review_count: number | null;
  shipping: string | null;
  marketplace_identity: Record<string, string | null>;
}

export type PersistedTrendDirectEvidence = Pick<TrendDirectEvidence, "claim"> & Partial<Omit<TrendDirectEvidence, "claim">>;

export interface TrendSignalEvidence extends Record<string, unknown> {
  direct_evidence?: PersistedTrendDirectEvidence[];
  source_urls?: unknown;
}

export interface TrendSignal {
  id: string;
  sourceType: TrendSourceType;
  sourceName: string;
  source: string;
  region: string;
  externalId: string | null;
  term: string;
  title: string;
  evidence: TrendSignalEvidence;
  observedAt: string;
  capturedAt: string;
  trendStrength: number | null;
  trendDirection: TrendDirection | null;
  offerId: string | null;
}

export interface TrendSignalClassification {
  id: string;
  signalId: string;
  commercialRelevance: number;
  isProductIntent: boolean;
  normalizedProductTerm: string | null;
  categoryHint: string | null;
  decision: TrendCommercialDecision;
  reason: string;
  aiModel: string;
  strategyVersion: string;
  classifiedAt: string;
}

export interface TrendSignalListItem extends TrendSignal {
  classification: TrendSignalClassification | null;
}

export interface TrendOpportunity {
  id: string;
  signalId: string;
  classificationId: string | null;
  offerId: string | null;
  marketplace: "Shopee" | "Mercado Livre" | null;
  normalizedProductTerm: string | null;
  matchStatus: TrendMatchStatus;
  matchReason: string | null;
  matchConfidence: number | null;
  currentPrice: number | null;
  oldPrice: number | null;
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
  confidence?: number | null;
  strategyVersion?: string;
  aiProvider?: string | null;
  aiModel?: string | null;
}

export interface TrendExperiment {
  id: string;
  opportunityId: string;
  windowDays: 7;
  strategyVersion: string;
  status: TrendLifecycleStatus;
  finalDecision: string | null;
}

export interface TrendExperimentListItem extends TrendExperiment {
  recommendationId: string | null;
  offerId: string | null;
  marketplace: "Shopee" | "Mercado Livre" | null;
  channel: string | null;
  format: string | null;
  hypothesis: string | null;
  startedAt: string | null;
  endsAt: string | null;
  decisionReason: string | null;
  metrics: Record<string, number | null>;
}

export interface TrendOpportunityListItem extends TrendOpportunity {
  signalTitle: string;
  recommendation: Pick<TrendRecommendation, "offerId" | "channel" | "format" | "justification" | "hypothesis" | "confidence" | "strategyVersion" | "aiProvider" | "aiModel" | "status"> | null;
}
