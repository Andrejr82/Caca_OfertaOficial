import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { TrendOpportunityListItem } from "@/core/trends/types";
import type { TrendSignal } from "@/core/trends/types";

export async function listTrendSignals(): Promise<TrendSignal[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trend_signals")
    .select("id,source_type,source_name,source,region,external_id,term,title,evidence,observed_at,captured_at,trend_strength,trend_direction,offer_id")
    .order("observed_at", { ascending: false })
    .limit(100);

  if (error || !data) return [];
  return data.map((row: any) => ({
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
    offerId: row.offer_id
  }));
}

export async function listTrendOpportunities(): Promise<TrendOpportunityListItem[]> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("trend_opportunities")
    .select("id,signal_id,offer_id,score,status,experiment_id,strategy_version,final_decision,trend_signals(title),trend_recommendations(offer_id,channel,format,justification,hypothesis)")
    .order("created_at", { ascending: false });

  if (error || !data) return [];

  return data.map((row: any) => ({
    id: row.id,
    signalId: row.signal_id,
    offerId: row.offer_id,
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
          hypothesis: row.trend_recommendations[0].hypothesis
        }
      : null
  }));
}
