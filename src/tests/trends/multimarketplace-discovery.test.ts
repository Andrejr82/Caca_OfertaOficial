import { describe, expect, it } from "vitest";
import { discoverTrendMarketplaceCandidates } from "@/lib/trends/multimarketplace-discovery";

describe("multimarketplace trend discovery", () => {
  it("searches both marketplaces and returns source counters", async () => {
    const result = await discoverTrendMarketplaceCandidates({
      runId: "run-1",
      intents: [{ normalizedProductTerm: "Air Fryer 4L", productIdentity: "Air Fryer 4L" }],
      searchShopee: async () => [{ id: "S-1", marketplace: "Shopee", productName: "Air Fryer 4L", shopeeItemId: "S-1", currentPrice: 299, marketplaceMetrics: { imageUrl: "https://img.example/S-1.jpg", affiliateUrl: "https://s.shopee.com.br/S-1" } }],
      searchMercadoLivre: async () => [{ id: "M-1", marketplace: "Mercado Livre", productName: "Air Fryer 4L", itemId: "M-1", currentPrice: 299, marketplaceMetrics: { imageUrl: "https://img.example/M-1.jpg", affiliateUrl: "https://mercadolivre.com.br/M-1?aff=1" } }]
    });

    expect(result.runId).toBe("run-1");
    expect(result.candidates).toHaveLength(2);
    expect(result.counters).toEqual({
      Shopee: { intents: 1, found: 1, noCandidates: 0, unavailable: 0, failed: 0 },
      "Mercado Livre": { intents: 1, found: 1, noCandidates: 0, unavailable: 0, failed: 0 }
    });
  });

  it("isolates a marketplace failure and sanitizes its error", async () => {
    const result = await discoverTrendMarketplaceCandidates({
      runId: "run-2",
      intents: [{ normalizedProductTerm: "Notebook", productIdentity: "Notebook" }],
      searchShopee: async () => { throw new Error("secret token should not leak"); },
      searchMercadoLivre: async () => [{ id: "M-2", marketplace: "Mercado Livre", productName: "Notebook", itemId: "M-2", currentPrice: 100, marketplaceMetrics: { imageUrl: "https://img.example/M-2.jpg", affiliateUrl: "https://mercadolivre.com.br/M-2?aff=1" } }]
    });

    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["M-2"]);
    expect(result.errors).toEqual([expect.objectContaining({
      marketplace: "Shopee",
      code: "discovery_failed",
      correlationId: expect.any(String),
      message: "Falha na descoberta comercial."
    })]);
    expect(JSON.stringify(result.errors)).not.toContain("secret token");
  });

  it("limits concurrent marketplace-intent jobs", async () => {
    let active = 0;
    let peak = 0;
    const search = async (query: string, marketplace: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return [{ id: `${marketplace}-${query}`, marketplace, productName: query, itemId: query, currentPrice: 100, marketplaceMetrics: { imageUrl: "https://img.example/item.jpg", affiliateUrl: "https://example.com/aff" } }];
    };

    await discoverTrendMarketplaceCandidates({
      runId: "run-3",
      intents: ["A", "B", "C"].map((term) => ({ normalizedProductTerm: term, productIdentity: term })),
      maxConcurrentJobs: 2,
      searchShopee: (query) => search(query, "Shopee"),
      searchMercadoLivre: (query) => search(query, "Mercado Livre")
    });

    expect(peak).toBeLessThanOrEqual(2);
  });
});
