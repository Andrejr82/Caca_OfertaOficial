import { describe, expect, it } from "vitest";
import {
  normalizeTrendCommercialCandidate,
  type TrendCommercialCandidateInput,
} from "@/core/trends/commercial-candidate";

function valid(overrides: Partial<TrendCommercialCandidateInput> = {}): TrendCommercialCandidateInput {
  return {
    marketplace: "Mercado Livre",
    nativeId: "MLB123",
    productName: "Air Fryer 4L",
    normalizedTerm: "air fryer",
    permalink: "https://www.mercadolivre.com.br/MLB123",
    imageUrl: "https://img.example/air-fryer.jpg",
    currentPrice: 299,
    oldPrice: 399,
    category: "Eletrodomésticos",
    observedAt: "2026-08-11T23:00:00.000Z",
    source: "mercado_livre_official",
    sourcePosition: 1,
    marketplaceMetrics: { ranking: 1, bestSeller: true },
    ...overrides,
  };
}

describe("TrendCommercialCandidate contract", () => {
  it("normaliza uma candidatura válida preservando identidade e evidências", () => {
    expect(normalizeTrendCommercialCandidate(valid())).toEqual(expect.objectContaining({
      marketplace: "Mercado Livre",
      nativeId: "MLB123",
      productName: "Air Fryer 4L",
      currentPrice: 299,
      oldPrice: 399,
      observedAt: "2026-08-11T23:00:00.000Z",
      sourcePosition: 1,
    }));
  });

  it("aceita identidade Shopee por itemId e exige URL HTTPS", () => {
    const candidate = normalizeTrendCommercialCandidate(valid({
      marketplace: "Shopee",
      nativeId: "123456",
      normalizedTerm: "carregador portátil",
      permalink: "https://s.shopee.com.br/123456",
      imageUrl: "https://cf.shopee.com.br/123456.jpg",
      source: "shopee_v1_official",
    }));

    expect(candidate.marketplace).toBe("Shopee");
    expect(candidate.nativeId).toBe("123456");
  });

  it("rejeita marketplace fora do escopo e identidade vazia", () => {
    expect(() => normalizeTrendCommercialCandidate(valid({ marketplace: "Amazon" as never }))).toThrow(/marketplace/i);
    expect(() => normalizeTrendCommercialCandidate(valid({ nativeId: " " }))).toThrow(/identidade/i);
  });

  it("rejeita preço, título, URL e data inválidos", () => {
    expect(() => normalizeTrendCommercialCandidate(valid({ currentPrice: 0 }))).toThrow(/preço/i);
    expect(() => normalizeTrendCommercialCandidate(valid({ productName: " " }))).toThrow(/título/i);
    expect(() => normalizeTrendCommercialCandidate(valid({ permalink: "http://example.com" }))).toThrow(/URL/i);
    expect(() => normalizeTrendCommercialCandidate(valid({ observedAt: "invalid-date" }))).toThrow(/data/i);
  });
});
