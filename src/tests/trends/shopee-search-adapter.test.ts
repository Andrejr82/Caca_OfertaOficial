import { describe, expect, it } from "vitest";
import { mapShopeeProductsToTrendCandidates } from "@/lib/trends/shopee-search-adapter";

describe("Trend → Shopee V1 search adapter", () => {
  it("keeps only official candidates with a native item id", () => {
    const candidates = mapShopeeProductsToTrendCandidates([
      { itemId: "123", shopId: "456", productName: "Power Bank 20000mAh", priceMin: "49.90", priceMax: "89.90", offerLink: "https://s.shopee.com.br/x" },
      { productName: "Sem item" }
    ]);

    expect(candidates).toEqual([expect.objectContaining({
      id: "123", marketplace: "Shopee", shopeeItemId: "123", currentPrice: 49.9, oldPrice: 89.9
    })]);
  });
});
