import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import type { TrendExperimentListItem, TrendOpportunityListItem, TrendSignalListItem } from "@/core/trends/types";

export async function listTrendSignals(options: { observedFrom?: string; observedTo?: string } = {}): Promise<TrendSignalListItem[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("trend_signals")
    .select("id,source_type,source_name,source,region,external_id,term,title,evidence,observed_at,captured_at,trend_strength,trend_direction,offer_id");

  if (options.observedFrom) query = query.gte("observed_at", options.observedFrom);
  if (options.observedTo) query = query.lt("observed_at", options.observedTo);

  const { data, error } = await query
    .order("observed_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  const signals = data.map((row: any) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceName: row.source_name,
    source: row.source,
    region: row.region,
    externalId: row.external_id,
    term: row.term,
    title: row.title,
    evidence: row.evidence || {},
    observedAt: row.observed_at,
    capturedAt: row.captured_at,
    trendStrength: row.trend_strength,
    trendDirection: row.trend_direction,
    offerId: row.offer_id,
    classification: null
  }));

  const signalIds = signals.map((signal) => signal.id);
  if (signalIds.length === 0) return signals;
  const { data: classifications } = await supabase
    .from("trend_signal_classifications")
    .select("id,trend_signal_id,commercial_relevance,is_product_intent,normalized_product_term,category_hint,decision,reason,ai_model,strategy_version,classified_at")
    .in("trend_signal_id", signalIds)
    .eq("strategy_version", TREND_COMMERCIAL_STRATEGY_VERSION)
    .order("classified_at", { ascending: false });

  const latestBySignal = new Map<string, any>();
  for (const row of classifications ?? []) {
    if (!latestBySignal.has(row.trend_signal_id)) latestBySignal.set(row.trend_signal_id, row);
  }
  return signals.map((signal) => {
    const row = latestBySignal.get(signal.id);
    return row ? {
      ...signal,
      classification: {
        id: row.id,
        signalId: row.trend_signal_id,
        commercialRelevance: row.commercial_relevance,
        isProductIntent: row.is_product_intent,
        normalizedProductTerm: row.normalized_product_term,
        categoryHint: row.category_hint,
        decision: row.decision,
        reason: row.reason,
        aiModel: row.ai_model,
        strategyVersion: row.strategy_version,
        classifiedAt: row.classified_at
      }
    } : signal;
  });
}

export async function listTrendOpportunities(): Promise<TrendOpportunityListItem[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trend_opportunities")
    .select("id,signal_id,classification_id,offer_id,marketplace,normalized_product_term,match_status,match_reason,match_confidence,score,status,experiment_id,strategy_version,final_decision,trend_signals(title),trend_recommendations(offer_id,channel,format,justification,hypothesis,confidence,strategy_version,ai_provider,ai_model,status),offers(current_price,old_price)")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    signalId: row.signal_id,
    classificationId: row.classification_id,
    offerId: row.offer_id,
    marketplace: row.marketplace,
    normalizedProductTerm: row.normalized_product_term,
    matchStatus: row.match_status ?? "matched",
    matchReason: row.match_reason,
    matchConfidence: row.match_confidence,
    currentPrice: row.offers?.current_price == null ? null : Number(row.offers.current_price),
    oldPrice: row.offers?.old_price == null ? null : Number(row.offers.old_price),
    score: row.score,
    status: row.status,
    experimentId: row.experiment_id,
    strategyVersion: row.strategy_version,
    finalDecision: row.final_decision,
    signalTitle: row.trend_signals?.title || "Sinal sem título",
    recommendation: row.trend_recommendations?.[0]
      ? {
          offerId: row.trend_recommendations[0].offer_id,
          channel: row.trend_recommendations[0].channel,
          format: row.trend_recommendations[0].format,
          justification: row.trend_recommendations[0].justification,
          hypothesis: row.trend_recommendations[0].hypothesis,
          confidence: row.trend_recommendations[0].confidence,
          strategyVersion: row.trend_recommendations[0].strategy_version,
          aiProvider: row.trend_recommendations[0].ai_provider,
          aiModel: row.trend_recommendations[0].ai_model,
          status: row.trend_recommendations[0].status
        }
      : null
  }));
}

export async function listTrendExperiments(): Promise<TrendExperimentListItem[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trend_experiments")
    .select("id,opportunity_id,recommendation_id,offer_id,marketplace,channel,format,hypothesis,window_days,strategy_version,started_at,ends_at,status,final_decision,decision_reason,metrics")
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data.map((row: any) => ({
    id: row.id,
    opportunityId: row.opportunity_id,
    windowDays: 7,
    strategyVersion: row.strategy_version,
    status: row.status,
    finalDecision: row.final_decision,
    recommendationId: row.recommendation_id,
    offerId: row.offer_id,
    marketplace: row.marketplace,
    channel: row.channel,
    format: row.format,
    hypothesis: row.hypothesis,
    startedAt: row.started_at,
    endsAt: row.ends_at,
    decisionReason: row.decision_reason,
    metrics: row.metrics && typeof row.metrics === "object" ? row.metrics : {}
  }));
}
