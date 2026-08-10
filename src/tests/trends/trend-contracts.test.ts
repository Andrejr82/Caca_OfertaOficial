import { describe, expect, it } from "vitest";
import {
  TREND_LIFECYCLE_STATUSES,
  TREND_SOURCE_TYPES,
  type TrendOpportunity,
  type TrendRecommendation,
  type TrendSignal,
  type TrendExperiment
} from "@/core/trends/types";

describe("Tendências IA: contratos de domínio", () => {
  it("expõe o lifecycle mínimo sem misturar estados editoriais", () => {
    expect(TREND_LIFECYCLE_STATUSES).toEqual([
      "discovered",
      "matched",
      "recommended",
      "approved",
      "active",
      "measuring",
      "completed",
      "scaled",
      "adjusted",
      "aborted"
    ]);
  });

  it("mantém fontes externas como contrato futuro, sem inventar sinal", () => {
    const signal: TrendSignal = {
      id: "signal-1",
      sourceType: "external",
      sourceName: "future-source",
      source: "google_trends",
      region: "BR",
      externalId: null,
      term: "Sinal futuro",
      title: "Sinal futuro",
      evidence: {},
      observedAt: "2026-08-10T00:00:00.000Z",
      capturedAt: "2026-08-10T00:00:00.000Z"
      ,trendStrength: null,
      trendDirection: "rising",
      offerId: null
    };

    expect(TREND_SOURCE_TYPES).toContain(signal.sourceType);
    expect(signal.evidence).toEqual({});
  });

  it("exige associação explícita por offerId na oportunidade e recomendação", () => {
    const opportunity: TrendOpportunity = {
      id: "opportunity-1",
      signalId: "signal-1",
      classificationId: null,
      offerId: "offer-1",
      marketplace: "Shopee",
      normalizedProductTerm: "produto",
      matchStatus: "matched",
      matchReason: "Identidade validada.",
      matchConfidence: 100,
      currentPrice: 99,
      oldPrice: 129,
      score: null,
      status: "matched",
      experimentId: null,
      strategyVersion: "trend-foundation-v1",
      finalDecision: null
    };
    const recommendation: TrendRecommendation = {
      id: "recommendation-1",
      opportunityId: opportunity.id,
      offerId: opportunity.offerId!,
      channel: "telegram",
      format: "offer_card",
      justification: "Aguardando fonte e evidência.",
      hypothesis: "A definir com dados reais.",
      status: "recommended"
    };

    expect(opportunity.offerId).toBe(recommendation.offerId);
    expect(opportunity).not.toHaveProperty("matchedProductName");
  });

  it("modela experimento sem executar experimento real", () => {
    const experiment: TrendExperiment = {
      id: "experiment-1",
      opportunityId: "opportunity-1",
      windowDays: 7,
      strategyVersion: "trend-foundation-v1",
      status: "approved",
      finalDecision: null
    };

    expect(experiment.windowDays).toBe(7);
    expect(experiment.finalDecision).toBeNull();
  });
});
