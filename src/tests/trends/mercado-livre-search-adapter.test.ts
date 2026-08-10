import { describe, expect, it } from "vitest";
import { mapMercadoLivreProductsToTrendCandidates, searchMercadoLivreForTrendTerm } from "@/lib/trends/mercado-livre-search-adapter";

describe("Trend → Mercado Livre search adapter", () => {
  it("reuses official-search fields without inventing commercial signals", () => {
    const candidates = mapMercadoLivreProductsToTrendCandidates("Air Fryer", [{
      item_id: "MLB123",
      product_id: "MLB-CAT123",
      title: "Air Fryer Mondial 4L",
      current_price: 299,
      old_price: 399,
      product_url: "https://www.mercadolivre.com.br/MLB123",
      seller_id: "seller-1",
      source_position: 1,
      official_store_id: null
    }]);

    expect(candidates).toEqual([expect.objectContaining({
      id: "MLB123",
      marketplace: "Mercado Livre",
      productName: "Air Fryer Mondial 4L",
      itemId: "MLB123",
      productId: "MLB-CAT123",
      currentPrice: 299,
      oldPrice: 399,
      permalink: "https://www.mercadolivre.com.br/MLB123"
    })]);
    expect(candidates[0].marketplaceMetrics).toMatchObject({ sellerId: "seller-1", sourcePosition: 1 });
  });

  it("fails closed when the official result has no native item identity", () => {
    expect(mapMercadoLivreProductsToTrendCandidates("Galaxy A17", [{ title: "Galaxy A17" }])).toEqual([]);
  });

  it("calls the existing official intent service once for one trend term", async () => {
    const calls: unknown[] = [];
    const candidates = await searchMercadoLivreForTrendTerm({
      runMercadoLivreOfficialIntentCoverage: async (input) => {
        calls.push(input);
        return { products: [{ item_id: "MLB456", title: "Parafusadeira 12V" }] };
      }
    }, "Parafusadeira", "oauth-token");

    expect(calls).toEqual([{ keywords: ["Parafusadeira"], accessToken: "oauth-token", maxPerIntent: 20, delayMs: 0 }]);
    expect(candidates[0].id).toBe("MLB456");
  });
});
