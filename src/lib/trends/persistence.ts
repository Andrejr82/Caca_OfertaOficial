import type { TrendSignal } from "@/core/trends/types";

interface TrendPersistenceClient {
  from(table: string): {
    upsert(rows: Record<string, unknown>[], options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
  };
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
