import { describe, expect, it } from "vitest";
import { discoverMarketplaceCandidates, expandMarketplaceQueries } from "@/lib/trends/targeted-marketplace-discovery";

describe("targeted marketplace discovery", () => {
  it("uses deterministic fallback queries without weakening identity", async () => {
    const queries = expandMarketplaceQueries("Britânia BELLA01 1300W");
    expect(queries).toEqual(["Britânia BELLA01 1300W", "Britânia BELLA01", "BELLA01"]);

    const result = await discoverMarketplaceCandidates({
      marketplace: "Shopee",
      normalizedProductTerm: "Britânia BELLA01 1300W",
      productIdentity: "Britânia BELLA01 1300W",
      searchShopee: async (query) => query === "Britânia BELLA01"
        ? [{ id: "item-1", marketplace: "Shopee", productName: "Escova Secadora Britânia BELLA01 1300W", shopeeItemId: "item-1" }]
        : []
    });

    expect(result.discovery_status).toBe("found");
    expect(result.query_used).toEqual(queries);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].productName).toContain("BELLA01");
  });

  it("reports no_match after real discovery returns no candidates", async () => {
    const result = await discoverMarketplaceCandidates({
      marketplace: "Mercado Livre",
      normalizedProductTerm: "Galaxy A17 256GB",
      productIdentity: "Galaxy A17 256GB",
      searchMercadoLivre: async () => []
    });

    expect(result.discovery_status).toBe("no_candidates");
    expect(result.candidates).toEqual([]);
  });
});
