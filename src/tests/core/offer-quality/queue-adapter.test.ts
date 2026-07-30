import { describe, expect, it } from "vitest";
import { selectOfferQualityQueueProducts } from "@/core/offer-quality/queue-adapter";

const product = (overrides: Record<string, unknown> = {}) => ({
  marketplace: "Mercado Livre",
  sourceItemId: "MLB1234567890",
  sourceUrl: "https://www.mercadolivre.com.br/p/MLB1234567890",
  title: "Air Fryer Digital 4 Litros",
  imageUrl: "https://http2.mlstatic.com/image.jpg",
  currentPrice: 199.9,
  originalPrice: 299.9,
  marketplaceMetrics: { item_id: "MLB1234567890", rating: 4.8, sales: 1200, shippingFree: true },
  monetization: { valid: true, affiliateUrl: "https://www.mercadolivre.com.br/item/MLB1234567890?partner_id=demo" },
  ...overrides,
});

describe("offer quality queue adapter", () => {
  it("returns only a valid V2 winner without fabricating tracking links", () => {
    const result = selectOfferQualityQueueProducts(
      [product(), product({ sourceItemId: "", title: "" })],
      { marketplace: "Mercado Livre", monetizationValid: (candidate: any) => candidate.monetization?.valid === true },
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]).toBeDefined();
    expect(result.accepted[0]).not.toHaveProperty("affiliateLinks");
    expect(result.rejected).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceItemId: "", reasons: expect.any(Array) }),
    ]));
  });

  it("does not admit a candidate with invalid pre-persist monetization", () => {
    const result = selectOfferQualityQueueProducts(
      [product({ sourceItemId: "MLB1234567891", monetization: { valid: false } })],
      { marketplace: "Mercado Livre", monetizationValid: () => false },
    );

    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]?.reasons).toContain("missing_monetization");
  });

  it("limits admission to the highest V2 scores when requested", () => {
    const result = selectOfferQualityQueueProducts(
      [
        product({ sourceItemId: "MLB1000000001", currentPrice: 49.9, originalPrice: 99.9 }),
        product({ sourceItemId: "MLB1000000002", currentPrice: 399.9, originalPrice: 449.9 }),
      ],
      {
        marketplace: "Mercado Livre",
        maxAccepted: 1,
        monetizationValid: (candidate: any) => candidate.monetization?.valid === true,
      },
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.sourceItemId).toBe("MLB1000000001");
    expect(["quality_rank_limit", "lower_ranked_in_group"]).toContain(
      result.rejected.find((item) => item.sourceItemId === "MLB1000000002")?.reasons[0],
    );
  });
});
