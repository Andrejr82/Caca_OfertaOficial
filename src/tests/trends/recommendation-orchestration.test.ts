import { describe, expect, it } from "vitest";
import { recommendAndPersistTrendOpportunity } from "@/lib/trends/recommendation-orchestration";

const opportunity = {
  id: "op-1", signalId: "sig-1", classificationId: null, offerId: "offer-1", marketplace: "Mercado Livre" as const,
  normalizedProductTerm: "air fryer 4l", matchStatus: "matched" as const, matchReason: "Identidade validada", matchConfidence: 100,
  currentPrice: 299, oldPrice: 399, score: 80, status: "matched" as const, experimentId: null,
  strategyVersion: "daily-commercial-radar-v1", finalDecision: null
};

describe("recommendation orchestration", () => {
  it("generates and persists a recommendation only for a matched offer", async () => {
    const provider = {
      name: "groq" as const,
      provider: "test-provider",
      model: "test-model",
      generate: async () => ({ provider: "test-provider", model: "test-model", content: {
        channel: "Instagram", format: "carrossel", rationale: "O produto tem atributos visuais observáveis.", hypothesis: "Uma apresentação visual pode explicar uso e características do item.", confidence: 82
      }, latencyMs: 0 })
    };
    const result = await recommendAndPersistTrendOpportunity(
      {} as never,
      "user-1",
      opportunity,
      { offerTitle: "Air Fryer 4L", evidenceStatus: "verified", provenance: "external_radar", category: "Casa" },
      provider,
      async (_client, userId, selectedOpportunity, recommendation) => ({
        id: "rec-1", opportunity_id: selectedOpportunity.id, offer_id: selectedOpportunity.offerId, channel: recommendation.channel, format: recommendation.format,
        justification: recommendation.rationale, hypothesis: recommendation.hypothesis, confidence: recommendation.confidence,
        strategy_version: recommendation.strategyVersion, ai_provider: recommendation.provider, ai_model: recommendation.model,
        status: "draft", created_at: new Date().toISOString()
      }),
    );
    expect(result).toMatchObject({ channel: "Instagram", format: "carrossel" });
  });
});
