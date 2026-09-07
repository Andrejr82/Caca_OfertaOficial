import { describe, it, expect } from "vitest";
import { selectCommercialPortfolioV2 } from "@/core/offer-selection/portfolio-selector";
import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";
import { calibrateCandidateScore } from "@/core/offer-selection/score-calibration";
import type { CandidateDecisionV2 } from "@/core/offer-selection/types";

function createCandidate(opts: {
  id: string;
  marketplace: "Shopee" | "Mercado Livre" | "Amazon";
  title: string;
  price: number;
  originalPrice?: number;
  productType?: string;
  rating?: number;
}): CandidateDecisionV2 {
  const norm = normalizeCandidateToV2({
    marketplace: opts.marketplace,
    sourceItemId: opts.id,
    title: opts.title,
    currentPrice: opts.price,
    originalPrice: opts.originalPrice,
    classification: { status: "classified", productType: opts.productType || "electronics" },
    marketplaceMetrics: { rating: opts.rating ?? 4.8, reviewCount: 500, shippingFree: true },
  });
  const score = calibrateCandidateScore(norm);
  return { ...norm, score };
}

describe("Sprint 7 — Seleção Determinística de Portfólio V2", () => {
  it("respeita limites por marketplace, categoria e total sem padding de produtos fracos", () => {
    const candidates: CandidateDecisionV2[] = [
      createCandidate({ id: "amz-1", marketplace: "Amazon", title: "Notebook Acer Aspire", price: 2500, productType: "notebook" }),
      createCandidate({ id: "amz-2", marketplace: "Amazon", title: "Monitor LG UltraGear 24", price: 800, productType: "monitor" }),
      createCandidate({ id: "amz-3", marketplace: "Amazon", title: "SSD Kingston 1TB", price: 390, productType: "ssd" }),
      createCandidate({ id: "ml-1", marketplace: "Mercado Livre", title: "Notebook Lenovo IdeaPad", price: 2200, productType: "notebook" }),
      createCandidate({ id: "ml-2", marketplace: "Mercado Livre", title: "Monitor Dell 27", price: 850, productType: "monitor" }),
      createCandidate({ id: "shp-1", marketplace: "Shopee", title: "Teclado Mecânico Redragon", price: 180, productType: "teclado" }),
      createCandidate({ id: "shp-2", marketplace: "Shopee", title: "Mouse Logitech G203", price: 120, productType: "mouse" }),
    ];

    const result = selectCommercialPortfolioV2(candidates, {
      maxTotal: 5,
      maxPerMarketplace: 2,
      maxPerCategory: 2,
      maxPerFamily: 1,
    });

    expect(result.selected.length).toBeLessThanOrEqual(5);
    expect(result.counts.byMarketplace["Amazon"]).toBeLessThanOrEqual(2);
    expect(result.counts.byMarketplace["Mercado Livre"]).toBeLessThanOrEqual(2);
    expect(result.counts.byMarketplace["Shopee"]).toBeLessThanOrEqual(2);
  });

  it("rejeita excesso com motivos claros e determinísticos", () => {
    const candidates: CandidateDecisionV2[] = [
      createCandidate({ id: "amz-1", marketplace: "Amazon", title: "Notebook Acer 1", price: 2000, productType: "notebook" }),
      createCandidate({ id: "amz-2", marketplace: "Amazon", title: "Notebook Acer 2", price: 2100, productType: "notebook" }),
      createCandidate({ id: "amz-3", marketplace: "Amazon", title: "Notebook Acer 3", price: 2200, productType: "notebook" }),
    ];

    const result = selectCommercialPortfolioV2(candidates, {
      maxTotal: 10,
      maxPerMarketplace: 1, // Apenas 1 da Amazon permitido
      maxPerCategory: 10,
    });

    expect(result.selected).toHaveLength(1);
    expect(result.rejected).toHaveLength(2);
    expect(result.rejected[0].reason).toBe("limite_marketplace");
  });
});
