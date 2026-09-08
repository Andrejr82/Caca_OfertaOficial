import { describe, it, expect } from "vitest";
import { calibrateCandidateScore } from "@/core/offer-selection/score-calibration";
import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";

describe("Sprint 6 — Motor de Qualidade Comercial e Calibração de Score", () => {
  it("calcula score canônico estruturado (0 a 100) com todos os componentes", () => {
    const candidate = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09TEST01",
      title: "Notebook Acer Aspire 5 Intel Core i5 8GB 512GB SSD",
      currentPrice: 2499,
      originalPrice: 3199,
      productRole: "main_product",
      classification: { status: "classified", productType: "notebook" },
      marketplaceMetrics: {
        rating: 4.8,
        reviewCount: 1500,
        prime: true,
        shippingFree: true,
      },
    });

    const score = calibrateCandidateScore(candidate);

    expect(score.version).toBe("candidate-decision/v2");
    expect(score.total).toBeGreaterThanOrEqual(70);
    expect(score.total).toBeLessThanOrEqual(100);
    expect(score.semantic).toBeGreaterThan(0);
    expect(score.evidence).toBeGreaterThan(0);
    expect(score.value).toBeGreaterThan(0);
    expect(score.logistics).toBeGreaterThan(0);
    expect(score.freshness).toBeGreaterThanOrEqual(0);
  });

  it("impede que produto barato sem prova social supere produto principal qualificado apenas por preço", () => {
    const mainProduct = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09MAIN",
      title: "Monitor Gamer LG UltraGear 24 144Hz IPS",
      currentPrice: 799,
      originalPrice: 1099,
      productRole: "main_product",
      classification: { status: "classified", productType: "monitor" },
      marketplaceMetrics: { rating: 4.8, reviewCount: 3000, prime: true, shippingFree: true },
    });

    const cheapWeakProduct = normalizeCandidateToV2({
      marketplace: "Amazon",
      sourceItemId: "B09CHEAP",
      title: "Cabo Adaptador Genérico sem Marca",
      currentPrice: 15,
      originalPrice: 50,
      productRole: "accessory",
      classification: { status: "review_required", productType: null },
      marketplaceMetrics: {},
    });

    const scoreMain = calibrateCandidateScore(mainProduct);
    const scoreWeak = calibrateCandidateScore(cheapWeakProduct);

    expect(scoreMain.total).toBeGreaterThan(scoreWeak.total);
  });

  it("trata ausência de dados como neutro e não gera NaN ou valores infinitos", () => {
    const candidateEmpty = normalizeCandidateToV2({
      marketplace: "Shopee",
      sourceItemId: "112233",
      title: "Teclado Básico",
      currentPrice: 50,
      marketplaceMetrics: {},
    });

    const score = calibrateCandidateScore(candidateEmpty);

    expect(Number.isFinite(score.total)).toBe(true);
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });
});
