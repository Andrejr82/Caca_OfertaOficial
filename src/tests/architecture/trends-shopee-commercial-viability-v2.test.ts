import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  assessCommercialViabilityV2,
  classifyTicketBand,
} = require("../../core/trends/commercial-viability-v2.cjs");

function shopeeCandidate(overrides: Record<string, unknown> = {}) {
  return {
    marketplace: "Shopee",
    currentPrice: 50,
    sales: 2500,
    commissionRate: 10,
    sellerCommissionRate: 5,
    ...overrides,
  };
}

describe("Shopee commercial viability V2", () => {
  it("classifies ticket only for diagnostics, without using it as an automatic veto", () => {
    expect(classifyTicketBand(5.97)).toBe("micro");
    expect(classifyTicketBand(18)).toBe("low");
    expect(classifyTicketBand(70)).toBe("medium");
    expect(classifyTicketBand(146.3)).toBe("high");
  });

  it("marks low ticket + low demand + weak commission as low viability", () => {
    const result = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 5,
      sales: 20,
      commissionRate: 3,
      sellerCommissionRate: 2,
    }));

    expect(result).toMatchObject({
      ticketBand: "micro",
      effectiveCommissionPercent: 5,
      estimatedCommissionPerSale: 0.25,
      demandBasis: "sales",
      commercialViabilityStatus: "low",
    });
  });

  it("allows low ticket to survive when real demand and commission are strong", () => {
    const result = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 8,
      sales: 15000,
      commissionRate: 18,
      sellerCommissionRate: 12,
    }));

    expect(result.ticketBand).toBe("micro");
    expect(result.estimatedCommissionPerSale).toBe(2.4);
    expect(result.commercialViabilityStatus).toBe("medium");
  });

  it("rates medium ticket + good demand + good commission as high viability", () => {
    const result = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 70,
      sales: 6000,
      commissionRate: 12,
      sellerCommissionRate: 8,
    }));

    expect(result.estimatedCommissionPerSale).toBe(14);
    expect(result.commercialViabilityStatus).toBe("high");
  });

  it("does not promote high ticket when demand evidence is absent", () => {
    const result = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 500,
      sales: null,
      commissionRate: 20,
      sellerCommissionRate: 10,
    }));

    expect(result.ticketBand).toBe("high");
    expect(result.demandBasis).toBe("none");
    expect(result.commercialViabilityStatus).toBe("insufficient_data");
  });

  it("does not invent commission when commission fields are absent", () => {
    const result = assessCommercialViabilityV2({
      marketplace: "Shopee",
      currentPrice: 80,
      sales: 5000,
    });

    expect(result.effectiveCommissionPercent).toBeNull();
    expect(result.estimatedCommissionPerSale).toBeNull();
    expect(result.commercialViabilityStatus).toBe("insufficient_data");
  });

  it("uses sales velocity only when velocity_status is computed", () => {
    const candidate = shopeeCandidate({ currentPrice: 40, sales: 300 });
    const computed = assessCommercialViabilityV2(candidate, {
      velocity_status: "computed",
      sales_velocity: 220,
    });
    const insufficient = assessCommercialViabilityV2(candidate, {
      velocity_status: "insufficient_history",
      sales_velocity: 999,
    });

    expect(computed.demandBasis).toBe("sales_velocity");
    expect(computed.demandStrength).toBeGreaterThan(insufficient.demandStrength);
    expect(insufficient.demandBasis).toBe("sales");
  });

  it("captures the real Radar baseline without treating price as a hard cutoff", () => {
    const grampo = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 5.97,
      sales: 11235,
      commissionRate: 12,
      sellerCommissionRate: 9,
    }));
    const creme = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 37.5,
      sales: 11488,
      commissionRate: 16,
      sellerCommissionRate: 10,
    }));
    const etiqueta = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 0.55,
      sales: 9456,
      commissionRate: 9,
      sellerCommissionRate: 6,
    }));

    expect(grampo.estimatedCommissionPerSale).toBe(1.2537);
    expect(grampo.commercialViabilityStatus).toBe("medium");
    expect(creme.estimatedCommissionPerSale).toBe(9.75);
    expect(creme.commercialViabilityStatus).toBe("high");
    expect(etiqueta.estimatedCommissionPerSale).toBe(0.0825);
    expect(etiqueta.commercialViabilityStatus).toBe("low");
  });

  it("preserves ambiguous price authority as diagnostic input instead of inventing certainty", () => {
    const result = assessCommercialViabilityV2(shopeeCandidate({
      currentPrice: 23.66,
      sales: 7242,
      commissionRate: 9,
      sellerCommissionRate: 6,
      priceRangeAmbiguous: true,
      priceAuthority: "priceMin",
    }));

    expect(result.priceRangeAmbiguous).toBe(true);
    expect(result.priceAuthority).toBe("priceMin");
    expect(result.reasons).toContain("Preço representa faixa/variação; usar retorno apenas como estimativa diagnóstica");
  });
});
