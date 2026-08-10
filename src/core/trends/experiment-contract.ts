import type { TrendOpportunity } from "@/core/trends/types";
import type { TrendRecommendationChannel, TrendRecommendationFormat } from "@/core/trends/recommendation-contract";

export const TREND_EXPERIMENT_WINDOW_DAYS = 7 as const;

export interface ApprovedTrendRecommendation {
  id: string;
  opportunityId: string;
  offerId: string;
  channel: TrendRecommendationChannel;
  format: TrendRecommendationFormat;
  reason: string;
  hypothesis: string;
  strategyVersion: string;
}

export interface TrendExperimentMetrics {
  salesCount: number;
  commissionValue: number;
  clickToSaleConversion: number;
  commissionPerClick: number;
  clicks: number;
  clicksPerPublication: number;
  ctr: number | null;
}

export interface TrendExperimentContract {
  opportunityId: string;
  recommendationId: string;
  offerId: string;
  marketplace: "Shopee" | "Mercado Livre";
  channel: TrendRecommendationChannel;
  format: TrendRecommendationFormat;
  hypothesis: string;
  strategyVersion: string;
  startedAt: string;
  endsAt: string;
  windowDays: 7;
  status: "approved";
  finalDecision: null;
  decisionReason: null;
  metrics: TrendExperimentMetrics;
}

export function buildTrendExperimentContract(input: {
  opportunity: TrendOpportunity | null;
  recommendation: ApprovedTrendRecommendation | null;
  approvedByHuman: boolean;
  startedAt: string;
}): TrendExperimentContract | null {
  const { opportunity, recommendation } = input;
  if (!input.approvedByHuman || !opportunity || !recommendation) return null;
  if (opportunity.matchStatus !== "matched" || !opportunity.offerId || !opportunity.marketplace) return null;
  if (recommendation.opportunityId !== opportunity.id || recommendation.offerId !== opportunity.offerId) return null;
  if (!recommendation.hypothesis.trim() || !recommendation.strategyVersion.trim()) return null;

  const startedAt = new Date(input.startedAt);
  if (Number.isNaN(startedAt.getTime())) return null;
  const endsAt = new Date(startedAt.getTime() + TREND_EXPERIMENT_WINDOW_DAYS * 24 * 60 * 60 * 1_000);

  return {
    opportunityId: opportunity.id,
    recommendationId: recommendation.id,
    offerId: opportunity.offerId,
    marketplace: opportunity.marketplace,
    channel: recommendation.channel,
    format: recommendation.format,
    hypothesis: recommendation.hypothesis,
    strategyVersion: recommendation.strategyVersion,
    startedAt: startedAt.toISOString(),
    endsAt: endsAt.toISOString(),
    windowDays: TREND_EXPERIMENT_WINDOW_DAYS,
    status: "approved",
    finalDecision: null,
    decisionReason: null,
    metrics: {
      salesCount: 0,
      commissionValue: 0,
      clickToSaleConversion: 0,
      commissionPerClick: 0,
      clicks: 0,
      clicksPerPublication: 0,
      ctr: null
    }
  };
}
