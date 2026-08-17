import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildMercadoLivreRadarProductsV1,
  combineMarketplaceProductsByScore,
} = require("../../../scripts/oracle-trends-radar-runner.cjs");
const {
  ML_OPPORTUNITY_STRATEGY_VERSION,
  scoreMercadoLivreOpportunityV1,
} = require("../../../scripts/mercadolivre-opportunity-v1.cjs");

const mlCandidate = (overrides: Record<string, unknown> = {}) => ({
  marketplace: "Mercado Livre",
  itemId: "MLB-1",
  productId: "MLB-P1",
  productName: "Mouse sem fio",
  category: "Mouses",
  currentPrice: 79,
  oldPrice: 119,
  sales: null,
  rating: null,
  commissionPercent: 0,
  permalink: "https://www.mercadolivre.com.br/p/MLB-P1",
  imageUrl: "https://http2.mlstatic.com/mouse.jpg",
  provenance: "mercadolivre_official_intent",
  sourceIntent: "mouse sem fio",
  macroGroup: "informatica",
  domainId: "MLB-COMPUTER_MICE",
  categoryId: "MLB1714",
  sourcePosition: 1,
  ...overrides,
});

describe("Mercado Livre Opportunity V1 integration with Radar", () => {
  it("persists the validated ML V1 score and strategy without inventing commission or sales", () => {
    const selected = [scoreMercadoLivreOpportunityV1(mlCandidate())];
    const products = buildMercadoLivreRadarProductsV1({
      radarRunId: "run-1",
      selectedRows: selected,
    });

    expect(products).toHaveLength(1);
    expect(products[0]).toMatchObject({
      radar_run_id: "run-1",
      marketplace: "Mercado Livre",
      product_term: "Mouse sem fio",
      commercial_score: selected[0].finalScore,
      match_status: "pending",
    });
    expect(products[0].direct_evidence[0]).toMatchObject({
      strategy_version: ML_OPPORTUNITY_STRATEGY_VERSION,
      sold_quantity: null,
    });
    expect(products[0].direct_evidence[0].commercial_metrics.commissionRate).toBe(0);
  });

  it("combines Shopee and ML by score with no fixed marketplace quota", () => {
    const shopee = Array.from({ length: 12 }, (_, index) => ({
      priority: index + 1,
      marketplace: "Shopee",
      product_term: `Shopee ${index + 1}`,
      commercial_score: 70 - index,
      is_focus: false,
      direct_evidence: [{ rank_position: index + 1 }],
    }));
    const ml = Array.from({ length: 18 }, (_, index) => ({
      priority: index + 1,
      marketplace: "Mercado Livre",
      product_term: `ML ${index + 1}`,
      commercial_score: 90 - index,
      is_focus: false,
      direct_evidence: [{ rank_position: index + 1 }],
    }));

    const combined = combineMarketplaceProductsByScore(shopee, ml, 20);

    expect(combined).toHaveLength(20);
    expect(combined[0]).toMatchObject({ marketplace: "Mercado Livre", commercial_score: 90, priority: 1, is_focus: true });
    expect(combined.map((row: any) => row.priority)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(combined.every((row: any, index: number) => row.direct_evidence[0].rank_position === index + 1)).toBe(true);
    expect(new Set(combined.map((row: any) => row.marketplace)).size).toBe(2);
  });
});
