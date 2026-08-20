import { describe, expect, it } from "vitest";
import { buildCommercialLearningRecommendation } from "@/lib/social/commercial-learning";
import type { SocialCopyExperimentEvaluation } from "@/lib/social/copy-experiments";

function experiment(overrides: Partial<SocialCopyExperimentEvaluation> = {}): SocialCopyExperimentEvaluation {
  return {
    experimentKey: "exp-jiesipote-wa",
    offerId: "jiesipote",
    channel: "whatsapp",
    status: "learning",
    metric: null,
    leaderVariantId: null,
    leaderAngle: null,
    reasons: ["minimum_exposure_not_reached"],
    variants: [
      { variantId: "a", angle: "proof", impressions: 100, clicks: 5, purchases: 0, ctrPct: 5, conversionRatePct: 0, epcBRL: null },
      { variantId: "b", angle: "saving", impressions: 100, clicks: 4, purchases: 0, ctrPct: 4, conversionRatePct: 0, epcBRL: null },
    ],
    ...overrides,
  };
}

describe("Task 10 — Aprendizado Comercial", () => {
  it("mantém aprendizado quando a amostra ainda não amadureceu", () => {
    const result = buildCommercialLearningRecommendation({ experiment: experiment() });
    expect(result.decision).toBe("LEARN_MORE");
    expect(result.preferredAngle).toBeNull();
    expect(result.autoApply).toBe(false);
  });

  it("trata liderança de CTR apenas como hipótese para novo teste", () => {
    const result = buildCommercialLearningRecommendation({
      experiment: experiment({ status: "leader", metric: "ctr", leaderVariantId: "a", leaderAngle: "proof", reasons: ["ctr_observational_lead"] }),
    });
    expect(result.decision).toBe("TEST_ANGLE");
    expect(result.preferredAngle).toBe("proof");
    expect(result.autoApply).toBe(false);
  });

  it("prefere ângulo apenas com liderança de conversão e compra real", () => {
    const result = buildCommercialLearningRecommendation({
      experiment: experiment({
        status: "leader",
        metric: "conversion_rate",
        leaderVariantId: "a",
        leaderAngle: "proof",
        reasons: ["conversion_rate_observational_lead"],
        variants: [
          { variantId: "a", angle: "proof", impressions: 500, clicks: 30, purchases: 3, ctrPct: 6, conversionRatePct: 10, epcBRL: 0.3 },
          { variantId: "b", angle: "saving", impressions: 500, clicks: 30, purchases: 1, ctrPct: 6, conversionRatePct: 3.33, epcBRL: 0.1 },
        ],
      }),
    });
    expect(result.decision).toBe("PREFER_ANGLE");
    expect(result.preferredAngle).toBe("proof");
    expect(result.autoApply).toBe(false);
  });

  it("prioriza guardrail de cadência sobre recomendação comercial", () => {
    const result = buildCommercialLearningRecommendation({
      experiment: experiment({ status: "leader", metric: "ctr", leaderVariantId: "a", leaderAngle: "proof", reasons: ["ctr_observational_lead"] }),
      cadence: { decision: "DEFER", reasons: ["same_offer_same_channel"], nextEligibleAt: "2026-08-21T12:00:00.000Z", matchedHistoryCount: 1 },
    });
    expect(result.decision).toBe("WAIT_CADENCE");
    expect(result.preferredAngle).toBeNull();
  });
});
