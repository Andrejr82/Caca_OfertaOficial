import type { TrendSignal, TrendSignalClassification } from "@/core/trends/types";

interface TrendPersistenceClient {
  from(table: string): {
    upsert(rows: Record<string, unknown>[], options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export function toTrendSignalClassificationRow(userId: string, classification: TrendSignalClassification) {
  return {
    user_id: userId,
    trend_signal_id: classification.signalId,
    commercial_relevance: classification.commercialRelevance,
    is_product_intent: classification.isProductIntent,
    normalized_product_term: classification.normalizedProductTerm,
    category_hint: classification.categoryHint,
    decision: classification.decision,
    reason: classification.reason,
    ai_model: classification.aiModel,
    strategy_version: classification.strategyVersion,
    classified_at: classification.classifiedAt
  };
}

export async function persistTrendSignalClassifications(
  client: TrendPersistenceClient,
  userId: string,
  classifications: TrendSignalClassification[]
): Promise<number> {
  if (classifications.length === 0) return 0;
  const rows = classifications.map((classification) => toTrendSignalClassificationRow(userId, classification));
  const { error } = await client.from("trend_signal_classifications").upsert(rows, { onConflict: "user_id,trend_signal_id,strategy_version" });
  if (error) throw new Error(`Falha ao persistir classificação de tendência: ${error.message}`);
  return rows.length;
}

export async function persistTrendSignals(client: TrendPersistenceClient, userId: string, signals: TrendSignal[]): Promise<number> {
  const rows = signals
    .filter((signal) => signal.source === "google_trends")
    .map((signal) => ({
      user_id: userId,
      source_type: signal.sourceType,
      source_name: signal.sourceName,
      source: signal.source,
      region: signal.region,
      external_id: signal.externalId,
      term: signal.term,
      title: signal.title,
      evidence: signal.evidence,
      observed_at: signal.observedAt,
      captured_at: signal.capturedAt,
      trend_strength: signal.trendStrength,
      trend_direction: signal.trendDirection,
      offer_id: null
    }));

  if (rows.length === 0) return 0;
  const { error } = await client.from("trend_signals").upsert(rows, { onConflict: "user_id,source_name,external_id" });
  if (error) throw new Error(`Falha ao persistir sinais de tendência: ${error.message}`);
  return rows.length;
}
