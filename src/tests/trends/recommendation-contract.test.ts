import { describe, expect, it } from "vitest";
import type { TrendOpportunity } from "@/core/trends/types";
import {
  TREND_RECOMMENDATION_CHANNELS,
  TREND_RECOMMENDATION_FORMATS,
  buildTrendRecommendationContract
} from "@/core/trends/recommendation-contract";

const opportunity = (overrides: Partial<TrendOpportunity> = {}): TrendOpportunity => ({
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
  finalDecision: null,
  ...overrides
});

describe("trend recommendation contract", () => {
  it("bloqueia recomendação para no_match e oportunidade sem oferta", () => {
    expect(buildTrendRecommendationContract(opportunity({ offerId: null, matchStatus: "no_match" }))).toBeNull();
    expect(buildTrendRecommendationContract(null)).toBeNull();
  });

  it("define canais e formatos permitidos sem escolher um automaticamente", () => {
    expect(TREND_RECOMMENDATION_CHANNELS).toEqual(["WhatsApp", "Telegram", "Instagram", "Facebook"]);
    expect(TREND_RECOMMENDATION_FORMATS).toEqual(["imagem", "carrossel", "vídeo"]);
    expect(buildTrendRecommendationContract(opportunity())).toMatchObject({
      opportunityId: "opportunity-1",
      channel: null,
      format: null,
      reason: null,
      strategyVersion: null
    });
  });
});
