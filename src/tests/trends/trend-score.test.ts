import { describe, expect, it } from "vitest";
import { calculateTrendScore } from "@/core/trends/trend-score";

describe("trend score", () => {
  it("separates trend score from commercial proof", () => {
    const result = calculateTrendScore([
      { sourceName: "google_trends", sourceType: "external", observedAt: "2026-08-11T10:00:00.000Z", trendStrength: 100000, trendDirection: "rising", growthPercent: 100, sourcePosition: 1 },
      { sourceName: "mercado_livre_trends", sourceType: "external", observedAt: "2026-08-11T09:00:00.000Z", trendDirection: "rising", growthPercent: 50, sourcePosition: 2 }
    ], { now: "2026-08-11T12:00:00.000Z" });

    expect(result.trendScore).toBe(80);
    expect(result.breakdown).toEqual({ recency: 30, growth: 20, position: 20, convergence: 10 });
    expect(result.sourceCount).toBe(2);
    expect(result.interestOnly).toBe(true);
    expect(result.evidencePolicy).toBe("interest_only");
  });

  it("reduces stale, falling and unranked signals without inventing sales evidence", () => {
    const result = calculateTrendScore([
      { sourceName: "google_trends", observedAt: "2026-07-01T12:00:00.000Z", trendDirection: "falling" }
    ], { now: "2026-08-11T12:00:00.000Z" });

    expect(result.trendScore).toBe(0);
    expect(result.breakdown).toEqual({ recency: 0, growth: 0, position: 0, convergence: 0 });
    expect(result.evidencePolicy).toBe("interest_only");
  });
});
