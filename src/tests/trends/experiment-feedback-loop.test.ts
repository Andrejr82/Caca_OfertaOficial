import { describe, expect, it } from "vitest";
import { buildExperimentFeedback } from "@/core/trends/experiment-feedback-loop";

const base = {
  experimentId: "exp-1",
  opportunityId: "opp-1",
  recommendationId: "rec-1",
  offerId: "offer-1",
  marketplace: "Shopee",
  channel: "Instagram",
  format: "vídeo",
  status: "completed",
  finalDecision: "SCALE",
  decisionReason: "bom desempenho",
  metrics: {
    clicks: 12,
    clicksPerPublication: 6,
    salesCount: 2,
    clickToSaleConversion: 0.16,
    commissionValue: 10,
    commissionPerClick: 0.83,
  },
};

describe("experiment feedback loop", () => {
  it("does not emit actionable feedback before a final decision exists", () => {
    const result = buildExperimentFeedback({ ...base, status: "approved", finalDecision: null });
    expect(result.actionable).toBe(false);
    expect(result.nextRadarAction).toBe("none");
  });

  it.each([
    ["SCALE", "boost"],
    ["ADJUST", "adjust"],
    ["ABORT", "suppress"],
  ] as const)("maps %s to %s for the next Radar", (finalDecision, nextRadarAction) => {
    const result = buildExperimentFeedback({ ...base, finalDecision });
    expect(result.actionable).toBe(true);
    expect(result.nextRadarAction).toBe(nextRadarAction);
    expect(result.provenance).toEqual({ experimentId: "exp-1", recommendationId: "rec-1", offerId: "offer-1" });
  });

  it("keeps sales metrics out when attribution is not trustworthy", () => {
    const result = buildExperimentFeedback({ ...base, salesAttributionVerified: false });
    expect(result.metrics.salesCount).toBeNull();
    expect(result.metrics.clickToSaleConversion).toBeNull();
    expect(result.metrics.commissionValue).toBeNull();
    expect(result.metrics.commissionPerClick).toBeNull();
    expect(result.metrics.clicks).toBe(12);
  });

  it("allows attributed sales metrics only when explicitly verified", () => {
    const result = buildExperimentFeedback({ ...base, salesAttributionVerified: true });
    expect(result.metrics.salesCount).toBe(2);
    expect(result.metrics.clickToSaleConversion).toBe(0.16);
    expect(result.metrics.commissionValue).toBe(10);
  });

  it("fails closed for unknown final decisions", () => {
    const result = buildExperimentFeedback({ ...base, finalDecision: "WIN" });
    expect(result.actionable).toBe(false);
    expect(result.nextRadarAction).toBe("none");
  });
});
