import type { TrendSignal, TrendSignalClassification } from "@/core/trends/types";
import {
  filterMateriallyChangedTrendSignals,
  type PersistedTrendSignalSnapshot
} from "@/lib/trends/trend-evidence-deduplication";

interface TrendPersistenceSelectResult {
  data: PersistedTrendSignalSnapshot[] | null;
  error: { message: string } | null;
}

interface TrendPersistenceTable {
  upsert(rows: Record<string, unknown>[], options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  select?: (columns: string) => {
    eq(column: string, value: string): {
      in(column: string, values: string[]): PromiseLike<TrendPersistenceSelectResult>;
    };
  };
}

interface TrendPersistenceClient {
  from(table: string): TrendPersistenceTable;
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

const ALLOWED_TREND_SIGNAL_SOURCES = new Set([
  "google_trends",
  "mercado_livre_trends",
  "mercado_livre_best_seller",
  "shopee_product_offer",
  "shopee_campaign"
]);

async function readExistingTrendSignals(
  client: TrendPersistenceClient,
  userId: string,
  signals: TrendSignal[]
): Promise<PersistedTrendSignalSnapshot[]> {
  const table = client.from("trend_signals");
  if (!table.select || signals.length === 0) return [];

  const externalIds = [...new Set(
    signals
      .map((signal) => signal.externalId)
      .filter((externalId): externalId is string => typeof externalId === "string" && externalId.length > 0)
  )];
  if (externalIds.length === 0) return [];

  const { data, error } = await table
    .select("source_name,external_id,source_type,source,region,term,title,evidence,trend_strength,trend_direction")
    .eq("user_id", userId)
    .in("external_id", externalIds);

  if (error) throw new Error(`Falha ao verificar duplicidade de sinais de tendência: ${error.message}`);
  return data ?? [];
}

export async function persistTrendSignals(client: TrendPersistenceClient, userId: string, signals: TrendSignal[]): Promise<number> {
  const allowedSignals = signals.filter((signal) => ALLOWED_TREND_SIGNAL_SOURCES.has(signal.source));
  if (allowedSignals.length === 0) return 0;

  const existing = await readExistingTrendSignals(client, userId, allowedSignals);
  const changedSignals = filterMateriallyChangedTrendSignals(allowedSignals, existing);
  const rows = changedSignals.map((signal) => ({
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
