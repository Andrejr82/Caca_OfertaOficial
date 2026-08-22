import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  WEIGHTS_VNEXT,
  classifyCommercialDecisionVNext,
  applyPriorityEconomicsGate,
  calculateCommercialOpportunityScoreVNext,
} = require("../../core/trends/commercial-opportunity-score-vnext.cjs");

function base(overrides: Record<string, unknown> = {}) {
  return {
    marketplace: "Shopee",
    itemId: "item-1",
    shopId: "shop-1",
    productName: "Mixer Elétrico Portátil 2 em 1 Recarregável",
    currentPrice: 29.9,
    sales: 5000,
    ratingStar: 4.8,
    commissionRate: 10,
    discountPercent: 60,
    permalink: "https://s.shopee.com.br/item-1",
    imageUrl: "https://cf.shopee.com.br/file/item-1",
    provenance: "shopee_openapi_productOfferV2",
    ...overrides,
  };
}

function benchmark(overrides: Record<string, unknown> = {}) {
  return {
    peerCount: 0,
    peerConfidence: "NONE",
    peerPriceMin: null,
    peerPriceMedian: null,
    peerPriceMax: null,
    priceVsMedianPercent: null,
    benchmarkStatus: "insufficient_peers",
    priceCompetitive: false,
    ...overrides,
  };
}

describe("Commercial Opportunity Score VNext", () => {
  it("sums exactly 100 points with competitiveness as the largest pillar", () => {
    expect(Object.values(WEIGHTS_VNEXT).reduce((sum: number, value: unknown) => sum + Number(value), 0)).toBe(100);
    expect(WEIGHTS_VNEXT.competitiveness).toBe(30);
  });

  it("gives zero proven-competitiveness points to a solo product even with 70% discount", () => {
    const result = calculateCommercialOpportunityScoreVNext(base({ discountPercent: 70 }), {
      benchmark: benchmark(),
    });
    expect(result.breakdown.competitiveness).toBe(0);
    expect(result.benchmark.peerConfidence).toBe("NONE");
  });

  it("awards maximum competitiveness only when an authoritative benchmark proves best price", () => {
    const result = calculateCommercialOpportunityScoreVNext(base({ currentPrice: 20 }), {
      benchmark: benchmark({
        peerCount: 3,
        peerConfidence: "MEDIUM",
        peerPriceMin: 24,
        peerPriceMedian: 27,
        peerPriceMax: 30,
        priceVsMedianPercent: 25.9,
        benchmarkStatus: "authoritative",
        priceCompetitive: true,
      }),
    });
    expect(result.breakdown.competitiveness).toBe(30);
  });

  it("does not let absolute commission alone make an ordinary expensive catalog product beat an exceptional cheap opportunity", () => {
    const cheap = calculateCommercialOpportunityScoreVNext(base({
      currentPrice: 29.9,
      sales: 20000,
      ratingStar: 4.9,
      commissionRate: 12,
    }), {
      benchmark: benchmark({
        peerCount: 5,
        peerConfidence: "HIGH",
        peerPriceMin: 39.9,
        peerPriceMedian: 44.9,
        peerPriceMax: 49.9,
        priceVsMedianPercent: 33.4,
        benchmarkStatus: "authoritative",
        priceCompetitive: true,
      }),
      velocityInfo: { velocity_status: "computed", sales_velocity: 250 },
    });

    const expensive = calculateCommercialOpportunityScoreVNext(base({
      itemId: "catalog-1",
      productName: "Monitor Gamer 27 Polegadas 165Hz",
      currentPrice: 1200,
      sales: 500,
      ratingStar: 4.8,
      commissionRate: 10,
      discountPercent: 10,
    }), { benchmark: benchmark() });

    expect(cheap.total).toBeGreaterThan(expensive.total);
    expect(expensive.breakdown.economicReturn).toBeLessThanOrEqual(10);
  });

  it("keeps missing internal history neutral and sufficient zero-conversion history non-positive", () => {
    const fresh = calculateCommercialOpportunityScoreVNext(base(), {
      benchmark: benchmark(),
      internalPerformance: { matched: false },
    });
    const zero = calculateCommercialOpportunityScoreVNext(base(), {
      benchmark: benchmark(),
      internalPerformance: { matched: true, humanProbableClicks: 20, attributedSales: 0 },
    });
    expect(fresh.breakdown.internalConversion).toBe(0);
    expect(fresh.internalConversion.status).toBe("no_internal_history");
    expect(zero.breakdown.internalConversion).toBe(0);
    expect(zero.internalConversion.status).toBe("observed_zero_conversion");
  });

  it("does not promote a low-score Mercado Livre candidate to TESTAR just because it has discount", () => {
    const result = calculateCommercialOpportunityScoreVNext(base({
      marketplace: "Mercado Livre",
      shopId: undefined,
      productId: "MLB-PROD-1",
      itemId: "MLB123",
      currentPrice: 1299,
      sales: null,
      ratingStar: null,
      commissionRate: null,
      discountPercent: 55,
      permalink: "https://www.mercadolivre.com.br/p/MLB-PROD-1",
      imageUrl: "https://http2.mlstatic.com/image.jpg",
      provenance: "mercadolivre_official_intent",
    }), { benchmark: benchmark() });
    expect(result.total).toBeLessThan(65);
    expect(result.decision).not.toBe("TESTAR");
  });

  it("blocks Shopee PRIORIDADE when factual commission is unknown", () => {
    expect(applyPriorityEconomicsGate(base({ commissionRate: null }), { status: "unknown" }, "PRIORIDADE"))
      .toBe("TESTAR");
    expect(applyPriorityEconomicsGate(base({ commissionRate: 10 }), { status: "observed" }, "PRIORIDADE"))
      .toBe("PRIORIDADE");
  });

  it("does not invent a commission gate for Mercado Livre", () => {
    const ml = base({ marketplace: "Mercado Livre", shopId: undefined, itemId: "MLB123", productId: "MLB-PROD-1" });
    expect(applyPriorityEconomicsGate(ml, { status: "unknown" }, "PRIORIDADE"))
      .toBe("PRIORIDADE");
  });

  it("fails closed when a critical integrity gate is missing", () => {
    const result = calculateCommercialOpportunityScoreVNext(base({ imageUrl: "" }), {
      benchmark: benchmark({
        peerCount: 5,
        peerConfidence: "HIGH",
        peerPriceMin: 20,
        peerPriceMedian: 25,
        peerPriceMax: 30,
        priceVsMedianPercent: 20,
        benchmarkStatus: "authoritative",
      }),
    });
    expect(result.gates.integrity.passed).toBe(false);
    expect(result.decision).toBe("IGNORAR");
  });

  it("uses VNext decision thresholds without marketplace-specific promotion", () => {
    expect(classifyCommercialDecisionVNext(80)).toBe("PRIORIDADE");
    expect(classifyCommercialDecisionVNext(79)).toBe("TESTAR");
    expect(classifyCommercialDecisionVNext(65)).toBe("TESTAR");
    expect(classifyCommercialDecisionVNext(64)).toBe("OBSERVAR");
    expect(classifyCommercialDecisionVNext(50)).toBe("OBSERVAR");
    expect(classifyCommercialDecisionVNext(49)).toBe("IGNORAR");
  });
});
