import { describe, expect, it } from "vitest";
import type { TrendOpportunity } from "@/core/trends/types";
import { buildTrendExperimentContract, TREND_EXPERIMENT_WINDOW_DAYS } from "@/core/trends/experiment-contract";

const opportunity: TrendOpportunity = {
  id: "opportunity-1",
  signalId: "signal-1",
  classificationId: "classification-1",
  offerId: "offer-1",
  marketplace: "Shopee",
  normalizedProductTerm: "Galaxy S26 FE",
  matchStatus: "matched",
  matchReason: "Identidade validada.",
  matchConfidence: 100,
  currentPrice: 2499,
  oldPrice: 2999,
  score: null,
  status: "matched",
  experimentId: null,
  strategyVersion: "trend-commercial-v1",
  finalDecision: null
};

const recommendation = {
  id: "recommendation-1",
  opportunityId: "opportunity-1",
  offerId: "offer-1",
  channel: "WhatsApp" as const,
  format: "imagem" as const,
  reason: "Produto visual e de decisão rápida.",
  hypothesis: "Uma oferta visual no WhatsApp aumentará cliques qualificados.",
  strategyVersion: "trend-recommendation-v1"
};

describe("trend experiment contract", () => {
  it("bloqueia no_match, recommendation ausente e aprovação não humana", () => {
    expect(buildTrendExperimentContract({ opportunity: { ...opportunity, matchStatus: "no_match" }, recommendation, approvedByHuman: true, startedAt: "2026-08-10T12:00:00.000Z" })).toBeNull();
    expect(buildTrendExperimentContract({ opportunity, recommendation: null, approvedByHuman: true, startedAt: "2026-08-10T12:00:00.000Z" })).toBeNull();
    expect(buildTrendExperimentContract({ opportunity, recommendation, approvedByHuman: false, startedAt: "2026-08-10T12:00:00.000Z" })).toBeNull();
  });

  it("gera payload aprovado com janela exata de sete dias e métricas neutras", () => {
    const result = buildTrendExperimentContract({ opportunity, recommendation, approvedByHuman: true, startedAt: "2026-08-10T12:00:00.000Z" });
    expect(result).toMatchObject({
      opportunityId: "opportunity-1",
      recommendationId: "recommendation-1",
      offerId: "offer-1",
      marketplace: "Shopee",
      channel: "WhatsApp",
      format: "imagem",
      strategyVersion: "trend-recommendation-v1",
      startedAt: "2026-08-10T12:00:00.000Z",
      endsAt: "2026-08-17T12:00:00.000Z",
      status: "approved",
      finalDecision: null,
      decisionReason: null,
      windowDays: TREND_EXPERIMENT_WINDOW_DAYS,
      metrics: {
        salesCount: 0,
        commissionValue: 0,
        clickToSaleConversion: 0,
        commissionPerClick: 0,
        clicks: 0,
        clicksPerPublication: 0,
        ctr: null
      }
    });
  });
});
