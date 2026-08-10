import type { TrendOpportunity } from "@/core/trends/types";

export const TREND_RECOMMENDATION_CHANNELS = ["WhatsApp", "Telegram", "Instagram", "Facebook"] as const;
export const TREND_RECOMMENDATION_FORMATS = ["imagem", "carrossel", "vídeo"] as const;

export type TrendRecommendationChannel = (typeof TREND_RECOMMENDATION_CHANNELS)[number];
export type TrendRecommendationFormat = (typeof TREND_RECOMMENDATION_FORMATS)[number];

export interface TrendRecommendationContract {
  opportunityId: string;
  channel: TrendRecommendationChannel | null;
  format: TrendRecommendationFormat | null;
  reason: string | null;
  strategyVersion: string | null;
}

export function buildTrendRecommendationContract(opportunity: TrendOpportunity | null): TrendRecommendationContract | null {
  if (!opportunity?.offerId || opportunity.matchStatus !== "matched") return null;
  return {
    opportunityId: opportunity.id,
    channel: null,
    format: null,
    reason: null,
    strategyVersion: null
  };
}
