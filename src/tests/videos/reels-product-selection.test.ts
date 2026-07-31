import { describe, expect, it } from "vitest";
import { selectLowestPriceCandidate } from "@/lib/videos/reels/product-selection";

describe("reel product selection", () => {
  it("selects the lowest Shopee price without relying on the offer list order", () => {
    const selected = selectLowestPriceCandidate([
      { itemId: "1", shopId: "10", productName: "Mais caro", productLink: "https://s.shopee.com.br/a", offerLink: "https://s.shopee.com.br/a", priceMin: 39.99 },
      { itemId: "2", shopId: "20", productName: "Mais barato", productLink: "https://s.shopee.com.br/b", offerLink: "https://s.shopee.com.br/b", priceMin: 29.9 }
    ]);

    expect(selected?.itemId).toBe("2");
  });

  it("returns null when no candidate has a monetized product link", () => {
    expect(selectLowestPriceCandidate([{ itemId: "1", shopId: "10", productName: "Produto", productLink: "", offerLink: "", priceMin: 10 }])).toBeNull();
  });
});
