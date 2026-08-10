import { describe, expect, it } from "vitest";
import type { AIProviderPort, AIProviderResponse } from "@/core/ai";
import type { TrendSignal } from "@/core/trends/types";
import { classifyTrendSignal, TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";

const signal = (term: string, evidence: Record<string, unknown> = {}): TrendSignal => ({
  id: `signal-${term}`,
  sourceType: "external",
  sourceName: "google_trends",
  source: "google_trends",
  region: "BR",
  externalId: term,
  term,
  title: term,
  evidence,
  observedAt: "2026-08-10T12:00:00.000Z",
  capturedAt: "2026-08-10T12:00:00.000Z",
  trendStrength: 500,
  trendDirection: "rising",
  offerId: null
});

function provider(content: unknown): AIProviderPort {
  return {
    name: "groq",
    model: "test-model",
    async generate(): Promise<AIProviderResponse> {
      return { content, provider: "groq", model: "test-model", latencyMs: 1 };
    }
  };
}

describe("trend commercial classifier", () => {
  it("classifica um produto identificável como elegível", async () => {
    const result = await classifyTrendSignal(signal("promoção iphone 17"), provider({
      commercial_relevance: 92,
      is_product_intent: true,
      normalized_product_term: "iphone 17",
      category_hint: "smartphone",
      decision: "eligible",
      reason: "Modelo de produto identificável."
    }));

    expect(result).toMatchObject({
      decision: "eligible",
      commercialRelevance: 92,
      normalizedProductTerm: "iphone 17",
      categoryHint: "smartphone",
      aiModel: "test-model",
      strategyVersion: TREND_COMMERCIAL_STRATEGY_VERSION
    });
  });

  it("rejeita latam airlines brasil mesmo se o modelo tentar aprovar", async () => {
    const result = await classifyTrendSignal(signal("latam airlines brasil"), provider({
      commercial_relevance: 90,
      is_product_intent: true,
      normalized_product_term: "latam airlines brasil",
      category_hint: "viagem",
      decision: "eligible",
      reason: "Termo popular."
    }));

    expect(result.decision).toBe("rejected");
    expect(result.normalizedProductTerm).toBeNull();
  });

  it("falha fechado quando a resposta tenta inventar produto", async () => {
    const result = await classifyTrendSignal(signal("promoção iphone 17"), provider({
      commercial_relevance: 80,
      is_product_intent: true,
      normalized_product_term: "iphone 17 capa premium",
      category_hint: "acessórios",
      decision: "eligible",
      reason: "Produto relacionado."
    }));

    expect(result.decision).toBe("rejected");
    expect(result.normalizedProductTerm).toBeNull();
  });
});
