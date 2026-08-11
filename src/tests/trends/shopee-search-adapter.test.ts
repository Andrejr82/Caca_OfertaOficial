import { describe, expect, it } from "vitest";
import { mapShopeeProductsToTrendCandidates } from "@/lib/trends/shopee-search-adapter";

describe("Trend → Shopee V1 search adapter", () => {
  it("keeps only official candidates with a native item id without inventing an old price from priceMax", () => {
    const candidates = mapShopeeProductsToTrendCandidates([
      { itemId: "123", shopId: "456", productName: "Power Bank 20000mAh", priceMin: "49.90", priceMax: "89.90", offerLink: "https://s.shopee.com.br/x" },
      { productName: "Sem item" }
    ]);

    expect(candidates).toEqual([expect.objectContaining({
      id: "123",
      marketplace: "Shopee",
      shopeeItemId: "123",
      currentPrice: 49.9,
      oldPrice: null,
      permalink: "https://s.shopee.com.br/x"
    })]);
    expect(candidates[0].marketplaceMetrics?.priceMax).toBe(89.9);
  });
});
