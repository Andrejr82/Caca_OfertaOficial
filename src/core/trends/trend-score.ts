export interface TrendScoreSignalInput {
  sourceName: string;
  sourceType?: string | null;
  observedAt: string;
  trendStrength?: number | null;
  trendDirection?: "rising" | "stable" | "falling" | null;
  growthPercent?: number | null;
  sourcePosition?: number | null;
}

export interface TrendScoreBreakdown {
  recency: number;
  growth: number;
  position: number;
  convergence: number;
}

export interface TrendScoreResult {
  trendScore: number;
  breakdown: TrendScoreBreakdown;
  sourceCount: number;
  interestOnly: boolean;
  evidencePolicy: "interest_only";
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function recencyScore(observedAt: string, now: Date): number {
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageHours = Math.max(0, (now.getTime() - timestamp) / 3_600_000);
  if (ageHours <= 24) return 30;
  if (ageHours <= 72) return 24;
  if (ageHours <= 168) return 16;
  if (ageHours <= 336) return 8;
  return 0;
}

function growthScore(signals: TrendScoreSignalInput[]): number {
  const growthValues = signals.map((signal) => Number(signal.growthPercent)).filter(Number.isFinite);
  if (growthValues.length > 0) return clamp(Math.max(...growthValues) / 5, 0, 30);
  if (signals.some((signal) => signal.trendDirection === "rising")) return 15;
  if (signals.some((signal) => signal.trendDirection === "stable")) return 8;
  return 0;
}

function positionScore(signals: TrendScoreSignalInput[]): number {
  const positions = signals.map((signal) => Number(signal.sourcePosition)).filter((position) => Number.isFinite(position) && position > 0);
  if (positions.length === 0) return 0;
  return clamp(20 - (Math.min(...positions) - 1) * 2, 0, 20);
}

export function calculateTrendScore(signals: TrendScoreSignalInput[], options: { now?: string | Date } = {}): TrendScoreResult {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const uniqueSources = new Set(signals.map((signal) => signal.sourceName.trim()).filter(Boolean));
  const breakdown: TrendScoreBreakdown = {
    recency: signals.length ? Math.max(...signals.map((signal) => recencyScore(signal.observedAt, now))) : 0,
    growth: growthScore(signals),
    position: positionScore(signals),
    convergence: clamp(Math.max(0, uniqueSources.size - 1) * 10, 0, 20)
  };
  return {
    trendScore: Number((breakdown.recency + breakdown.growth + breakdown.position + breakdown.convergence).toFixed(2)),
    breakdown,
    sourceCount: uniqueSources.size,
    interestOnly: true,
    evidencePolicy: "interest_only"
  };
}
