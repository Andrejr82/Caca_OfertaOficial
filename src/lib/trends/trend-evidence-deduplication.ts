import type { TrendSignal } from "@/core/trends/types";

export interface PersistedTrendSignalSnapshot {
  source_name: string;
  external_id: string;
  source_type: string;
  source: string;
  region: string;
  term: string;
  title: string;
  evidence: unknown;
  trend_strength: number | null;
  trend_direction: string | null;
}

const VOLATILE_KEYS = new Set(["observed_at", "captured_at", "observedAt", "capturedAt"]);

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !VOLATILE_KEYS.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalize(entry)])
  );
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function signalMaterialShape(signal: TrendSignal) {
  return {
    source_type: signal.sourceType,
    source_name: signal.sourceName,
    source: signal.source,
    region: signal.region,
    external_id: signal.externalId,
    term: signal.term,
    title: signal.title,
    evidence: signal.evidence,
    trend_strength: signal.trendStrength,
    trend_direction: signal.trendDirection
  };
}

export function trendSignalMaterialFingerprint(signal: TrendSignal): string {
  return stableStringify(signalMaterialShape(signal));
}

function persistedMaterialFingerprint(signal: PersistedTrendSignalSnapshot): string {
  return stableStringify(signal);
}

export function filterMateriallyChangedTrendSignals(
  signals: TrendSignal[],
  existing: PersistedTrendSignalSnapshot[]
): TrendSignal[] {
  const existingByIdentity = new Map(
    existing.map((signal) => [
      `${signal.source_name}\u0000${signal.external_id}`,
      persistedMaterialFingerprint(signal)
    ])
  );
  const seenBatch = new Map<string, string>();
  const result: TrendSignal[] = [];

  for (const signal of signals) {
    const identity = `${signal.sourceName}\u0000${signal.externalId}`;
    const fingerprint = trendSignalMaterialFingerprint(signal);
    const previousBatchFingerprint = seenBatch.get(identity);

    if (previousBatchFingerprint !== undefined) {
      if (previousBatchFingerprint === fingerprint) continue;
      const previousIndex = result.findIndex((candidate) => `${candidate.sourceName}\u0000${candidate.externalId}` === identity);
      if (previousIndex >= 0) result[previousIndex] = signal;
      seenBatch.set(identity, fingerprint);
      continue;
    }

    seenBatch.set(identity, fingerprint);
    if (existingByIdentity.get(identity) === fingerprint) continue;
    result.push(signal);
  }

  return result;
}
