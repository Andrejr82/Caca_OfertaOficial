import type { SupabaseClient } from "@supabase/supabase-js";
import { recommendTrendChannelAndFormat, type TrendRecommendationContext } from "@/core/ai/trend-channel-format-recommender";
import type { AIProviderPort } from "@/core/ai/ports";
import type { TrendOpportunity } from "@/core/trends/types";
import { persistTrendRecommendation } from "@/lib/trends/recommendation-persistence";

export async function recommendAndPersistTrendOpportunity(
  client: SupabaseClient,
  userId: string,
  opportunity: TrendOpportunity,
  context: TrendRecommendationContext,
  provider: AIProviderPort,
  persist: typeof persistTrendRecommendation = persistTrendRecommendation,
) {
  if (!opportunity.offerId || opportunity.matchStatus !== "matched") return null;
  const recommendation = await recommendTrendChannelAndFormat(opportunity, context, provider, {
    correlationId: `trend-recommendation:${opportunity.id}`
  });
  if (!recommendation) return null;
  return persist(client, userId, opportunity, recommendation);
}

export async function loadMatchedTrendOpportunityForOffer(
  client: SupabaseClient,
  userId: string,
  offerId: string,
): Promise<TrendOpportunity | null> {
  const { data, error } = await client
    .from("trend_opportunities")
    .select("id,user_id,signal_id,classification_id,offer_id,marketplace,normalized_product_term,match_status,match_reason,match_confidence,current_price,old_price,score,status,experiment_id,strategy_version,final_decision")
    .eq("user_id", userId)
    .eq("offer_id", offerId)
    .eq("match_status", "matched")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Falha ao recuperar oportunidade Trends.");
  return (data as TrendOpportunity | null) ?? null;
}
