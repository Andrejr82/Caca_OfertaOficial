import type { VerifiedInternalPerformance } from "@/core/trends/commercial-opportunity-score-v2";
import type { InternalClickSignal } from "@/core/trends/internal-click-performance";

export function buildVerifiedInternalPerformance(signal: InternalClickSignal | null | undefined): VerifiedInternalPerformance {
  const clicks = signal?.distinctEventCount ?? 0;
  if (!Number.isInteger(clicks) || clicks < 5) return { verified: false, score: 0 };
  if (clicks >= 25) return { verified: true, score: 15 };
  if (clicks >= 10) return { verified: true, score: 10 };
  return { verified: true, score: 5 };
}

export function buildInternalPerformanceByProduct(
  signals: InternalClickSignal[],
): Record<string, VerifiedInternalPerformance> {
  const result: Record<string, VerifiedInternalPerformance> = {};
  for (const signal of signals) {
    const current = result[signal.normalizedProductTerm];
    const next = buildVerifiedInternalPerformance(signal);
    if (!current || next.score > current.score) result[signal.normalizedProductTerm] = next;
  }
  return result;
}
