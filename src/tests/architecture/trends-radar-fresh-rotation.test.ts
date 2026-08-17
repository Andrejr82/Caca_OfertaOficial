import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildTrendRadarProductsFromCandidates,
  getMarketplaceIdentityKey,
} = require("../../../scripts/oracle-trends-radar-engine.cjs");

function candidate(itemId: string, productName: string, sales: number) {
  return {
    marketplace: "Shopee",
    itemId,
    shopId: `shop-${itemId}`,
    productName,
    category: "Teste",
    currentPrice: 49.9,
    oldPrice: 79.9,
    discountPercent: 38,
    priceDiscountRate: 38,
    sales,
    ratingStar: 4.9,
    rating: 4.9,
    commissionPercent: 10,
    sellerCommissionRate: 0,
    permalink: `https://s.shopee.com.br/${itemId}`,
    observedAt: "2026-08-17T01:30:00.000Z",
  };
}

describe("Oracle Trends Radar fresh rotation", () => {
  it("prioritizes identities absent from the latest completed snapshot", () => {
    const repeatedA = candidate("100", "Campeão antigo A", 10000);
    const repeatedB = candidate("200", "Campeão antigo B", 9000);
    const freshA = candidate("300", "Produto novo A", 500);
    const freshB = candidate("400", "Produto novo B", 400);
    const previousSnapshotIdentityKeys = new Set([
      getMarketplaceIdentityKey(repeatedA),
      getMarketplaceIdentityKey(repeatedB),
    ]);

    const products = buildTrendRadarProductsFromCandidates({
      radarRunId: "run-fresh",
      shopeeCandidates: [repeatedA, repeatedB, freshA, freshB],
      previousSnapshotIdentityKeys,
      maxProducts: 2,
      now: new Date("2026-08-17T01:30:00.000Z"),
    });

    expect(products.map((product: { product_term: string }) => product.product_term)).toEqual([
      "Produto novo A",
      "Produto novo B",
    ]);
  });

  it("falls back to repeated identities only when fresh candidates cannot fill the result", () => {
    const repeatedA = candidate("100", "Campeão antigo A", 10000);
    const repeatedB = candidate("200", "Campeão antigo B", 9000);
    const fresh = candidate("300", "Produto novo", 500);
    const previousSnapshotIdentityKeys = new Set([
      getMarketplaceIdentityKey(repeatedA),
      getMarketplaceIdentityKey(repeatedB),
    ]);

    const products = buildTrendRadarProductsFromCandidates({
      radarRunId: "run-fallback",
      shopeeCandidates: [repeatedA, repeatedB, fresh],
      previousSnapshotIdentityKeys,
      maxProducts: 3,
      now: new Date("2026-08-17T01:30:00.000Z"),
    });

    expect(products).toHaveLength(3);
    expect(products[0].product_term).toBe("Produto novo");
    expect(products.slice(1).map((product: { product_term: string }) => product.product_term)).toEqual([
      "Campeão antigo A",
      "Campeão antigo B",
    ]);
  });
});
