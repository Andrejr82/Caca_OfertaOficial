import type { SupabaseClient } from "@supabase/supabase-js";
import type { AITrendRecommendation } from "@/core/ai/trend-channel-format-recommender";
import type { TrendOpportunity } from "@/core/trends/types";

export interface TrendRecommendationRow {
  user_id: string;
  opportunity_id: string;
  offer_id: string;
  channel: AITrendRecommendation["channel"];
  format: AITrendRecommendation["format"];
  justification: string;
  hypothesis: string;
  confidence: number;
  strategy_version: string;
  ai_provider: string;
  ai_model: string;
  status: "recommended";
}

export function buildTrendRecommendationRow(
  userId: string,
  opportunity: TrendOpportunity,
  recommendation: AITrendRecommendation
): TrendRecommendationRow {
  if (!userId || !opportunity.offerId || opportunity.matchStatus !== "matched") {
    throw new Error("Trend recommendation requires a matched opportunity with an offer");
  }
  return {
    user_id: userId,
    opportunity_id: opportunity.id,
    offer_id: opportunity.offerId,
    channel: recommendation.channel,
    format: recommendation.format,
    justification: recommendation.rationale,
    hypothesis: recommendation.hypothesis,
    confidence: recommendation.confidence,
    strategy_version: recommendation.strategyVersion,
    ai_provider: recommendation.provider,
    ai_model: recommendation.model,
    status: "recommended"
  };
}

export async function persistTrendRecommendation(
  client: SupabaseClient,
  userId: string,
  opportunity: TrendOpportunity,
  recommendation: AITrendRecommendation
) {
  const row = buildTrendRecommendationRow(userId, opportunity, recommendation);
  const { data, error } = await client
    .from("trend_recommendations")
    .upsert(row, { onConflict: "user_id,opportunity_id,strategy_version" })
    .select("id,opportunity_id,offer_id,channel,format,justification,hypothesis,confidence,strategy_version,ai_provider,ai_model,status,created_at")
    .single();
  if (error) throw error;
  return data;
}
