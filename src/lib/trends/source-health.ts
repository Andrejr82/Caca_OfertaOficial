export type TrendSourceCollectorStatus = "ok" | "empty" | "failed";
export type TrendSourceHealthStatus = "healthy" | "degraded" | "empty" | "failed";

export interface TrendSourceCollectionStats {
  source: string;
  status: TrendSourceCollectorStatus;
  received: number;
  accepted: number;
  rejected: number;
  errorCode: string | null;
}

export interface TrendSourceHealth {
  source: string;
  health: TrendSourceHealthStatus;
  collectorStatus: TrendSourceCollectorStatus;
  received: number;
  accepted: number;
  rejected: number;
  errorCode: string | null;
  observedAt: string;
}

export interface TrendSourceHealthSummary {
  sources: number;
  healthy: number;
  degraded: number;
  empty: number;
  failed: number;
  received: number;
  accepted: number;
  rejected: number;
}

function nonNegativeInteger(value: number): number {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function healthStatus(input: TrendSourceCollectionStats): TrendSourceHealthStatus {
  if (input.status === "failed") return "failed";
  if (input.status === "empty") return "empty";
  return input.rejected > 0 ? "degraded" : "healthy";
}

export function buildTrendSourceHealth(
  input: TrendSourceCollectionStats,
  observedAt: string
): TrendSourceHealth {
  const normalizedObservedAt = new Date(observedAt);
  if (Number.isNaN(normalizedObservedAt.getTime())) {
    throw new Error("observedAt inválido para saúde de fonte.");
  }

  return {
    source: String(input.source || "").trim(),
    health: healthStatus(input),
    collectorStatus: input.status,
    received: nonNegativeInteger(input.received),
    accepted: nonNegativeInteger(input.accepted),
    rejected: nonNegativeInteger(input.rejected),
    errorCode: input.errorCode ? String(input.errorCode) : null,
    observedAt: normalizedObservedAt.toISOString()
  };
}

export function summarizeTrendSourceHealth(health: TrendSourceHealth[]): TrendSourceHealthSummary {
  return health.reduce<TrendSourceHealthSummary>((summary, source) => {
    summary.sources += 1;
    summary[source.health] += 1;
    summary.received += source.received;
    summary.accepted += source.accepted;
    summary.rejected += source.rejected;
    return summary;
  }, {
    sources: 0,
    healthy: 0,
    degraded: 0,
    empty: 0,
    failed: 0,
    received: 0,
    accepted: 0,
    rejected: 0
  });
}
