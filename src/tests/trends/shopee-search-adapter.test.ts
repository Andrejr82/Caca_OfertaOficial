import { describe, expect, it } from "vitest";
import { mapRankedCandidatesToTrend } from "@/lib/trends/shopee-search-adapter";
import { processRawOffers } from "@/lib/shopee/ranking/search-service";
import { ShopeeRankedCandidate } from "@/lib/shopee/ranking/types";

describe("Trend → Shopee V1 search adapter", () => {
  it("keeps only official candidates with a native item id and uses maximumPrice for oldPrice", () => {
    const processed = processRawOffers([
      { 
        itemId: "123", 
        shopId: "456", 
        productName: "Power Bank 20000mAh", 
        priceMin: 49.90, 
        priceMax: 89.90, 
        offerLink: "https://s.shopee.com.br/x",
        productLink: "https://shopee.com.br/product/456/123",
        imageUrl: "https://cf.shopee.com.br/123.jpg",
        sales: 100,
        ratingStar: 4.8,
        commissionRate: 5
      },
      { productName: "Sem item" }
    ], { scenarioId: "test", categoryKey: "geral" }, "power bank", new Date().toISOString());

    const validCandidates = processed.filter(p => p.isValid).map(p => p.candidate as ShopeeRankedCandidate);
    const candidates = mapRankedCandidatesToTrend(validCandidates);

    expect(candidates).toEqual([expect.objectContaining({
      id: "123",
      marketplace: "Shopee",
      shopeeItemId: "123",
      currentPrice: 49.9,
      oldPrice: 89.9,
      permalink: "https://s.shopee.com.br/x"
    })]);
    expect(candidates[0].marketplaceMetrics?.priceMax).toBe(89.9);
  });
});
