import { describe, expect, it } from "vitest";
import { calculateDiscount, compareCandidates, scoreCandidate } from "@/core/offer-quality/scoring";
import { createOfferQualityCandidate } from "@/core/offer-quality/types";

const makeCandidate = (overrides: Partial<Parameters<typeof createOfferQualityCandidate>[0]> = {}) =>
  createOfferQualityCandidate({
    marketplace: "Mercado Livre",
    nativeIdentity: "MLB1234567890",
    sourceItemId: "MLB1234567890",
    title: "Produto principal com qualidade",
    sourceUrl: "https://www.mercadolivre.com.br/item/MLB1234567890",
    imageUrl: "https://cdn.example/image.jpg",
    currentPrice: 50,
    originalPrice: 100,
    marketplaceMetrics: { rating: 4.8, sales: 1000, shippingFree: true },
    currentFlowStatus: "pending_manual_review",
    ...overrides,
  });

describe("offer quality scoring", () => {
  it("marks a mathematical discount without evidence as unverified", () => {
    const result = calculateDiscount(makeCandidate());
    expect(result.percent).toBe(50);
    expect(result.confidence).toBe("unverified");
  });

  it("marks a discount with explicit price evidence as verified", () => {
    const result = calculateDiscount(makeCandidate({
      discountEvidence: { source: "price_history", observedAt: "2026-07-28T00:00:00Z" },
    }));
    expect(result.confidence).toBe("verified");
  });

  it("applies hard blockers before ranking", () => {
    const result = scoreCandidate(makeCandidate(), { blockers: ["missing_monetization"] });
    expect(result.total).toBe(0);
    expect(result.blockers).toContain("missing_monetization");
  });

  it("orders a lower-priced equivalent deterministically", () => {
    const cheaper = makeCandidate({ currentPrice: 40, sourceItemId: "MLB0000000002", nativeIdentity: "MLB0000000002" });
    expect(compareCandidates(cheaper, makeCandidate())).toBeLessThan(0);
  });
});
