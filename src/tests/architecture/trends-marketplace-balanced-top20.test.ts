import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { composeBalancedMarketplaceTop20 } = require("../../../scripts/marketplace-top20-balance.cjs");

function product(marketplace: "Shopee" | "Mercado Livre", index: number, score: number) {
  return {
    marketplace,
    product_term: `${marketplace} ${index}`,
    commercial_score: score,
    priority: index,
    is_focus: false,
    direct_evidence: [{ rank_position: index }],
  };
}

describe("balanced marketplace Top20 composition", () => {
  it("reserves up to 6 qualified products from each marketplace and fills remaining slots by score", () => {
    const shopee = Array.from({ length: 12 }, (_, index) => product("Shopee", index + 1, 70 - index));
    const ml = Array.from({ length: 18 }, (_, index) => product("Mercado Livre", index + 1, 90 - index));

    const result = composeBalancedMarketplaceTop20(shopee, ml, { maxProducts: 20, minimumPerMarketplace: 6 });

    expect(result).toHaveLength(20);
    expect(result.filter((row: any) => row.marketplace === "Shopee")).toHaveLength(6);
    expect(result.filter((row: any) => row.marketplace === "Mercado Livre")).toHaveLength(14);
    expect(result.map((row: any) => row.priority)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(result.every((row: any, index: number) => row.direct_evidence[0].rank_position === index + 1)).toBe(true);
  });

  it("never invents quota products when one marketplace has fewer qualified products", () => {
    const shopee = Array.from({ length: 3 }, (_, index) => product("Shopee", index + 1, 80 - index));
    const ml = Array.from({ length: 20 }, (_, index) => product("Mercado Livre", index + 1, 90 - index));

    const result = composeBalancedMarketplaceTop20(shopee, ml, { maxProducts: 20, minimumPerMarketplace: 6 });

    expect(result).toHaveLength(20);
    expect(result.filter((row: any) => row.marketplace === "Shopee")).toHaveLength(3);
    expect(result.filter((row: any) => row.marketplace === "Mercado Livre")).toHaveLength(17);
  });

  it("keeps final ordering deterministic by commercial score after minimum presence is secured", () => {
    const shopee = [
      product("Shopee", 1, 100),
      product("Shopee", 2, 95),
      product("Shopee", 3, 30),
      product("Shopee", 4, 29),
      product("Shopee", 5, 28),
      product("Shopee", 6, 27),
    ];
    const ml = Array.from({ length: 14 }, (_, index) => product("Mercado Livre", index + 1, 90 - index));

    const result = composeBalancedMarketplaceTop20(shopee, ml, { maxProducts: 20, minimumPerMarketplace: 6 });

    expect(result.slice(0, 3).map((row: any) => row.commercial_score)).toEqual([100, 95, 90]);
    expect(result.filter((row: any) => row.marketplace === "Shopee")).toHaveLength(6);
  });
});
