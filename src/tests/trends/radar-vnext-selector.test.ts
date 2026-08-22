import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { selectRadarVNext } = require("../../core/trends/radar-vnext-selector.cjs");

let sequence = 0;
function candidate(overrides: Record<string, unknown> = {}) {
  sequence += 1;
  return {
    marketplace: "Shopee",
    itemId: `item-${sequence}`,
    shopId: `shop-${sequence}`,
    productName: "Fone TWS Bluetooth X55 LED",
    currentPrice: 29.9,
    sales: 12000,
    ratingStar: 4.9,
    commissionRate: 10,
    sellerCommissionRate: 0,
    permalink: "https://s.shopee.com.br/example",
    imageUrl: "https://cf.shopee.com.br/file/example",
    provenance: "shopee_openapi_productOfferV2",
    ...overrides,
  };
}

function withPeers(target: Record<string, unknown>, prices = [40, 42, 44, 46, 48]) {
  return [
    target,
    ...prices.map((price, index) => candidate({
      itemId: `peer-${index}`,
      shopId: `peer-shop-${index}`,
      currentPrice: price,
    })),
  ];
}

describe("Radar VNext selector", () => {
  it("orders strictly by VNext score before applying diversity", () => {
    const strong = candidate({ itemId: "strong", shopId: "s1", currentPrice: 20, sales: 30000 });
    const medium = candidate({ itemId: "medium", shopId: "s2", currentPrice: 29, sales: 8000 });
    const weak = candidate({ itemId: "weak", shopId: "s3", currentPrice: 39, sales: 1500 });
    const pool = [strong, medium, weak, ...withPeers(strong).slice(1)];

    const selected = selectRadarVNext(pool, { maxProducts: 3 });

    expect(selected).toHaveLength(3);
    expect(selected[0].score.total).toBeGreaterThanOrEqual(selected[1].score.total);
    expect(selected[1].score.total).toBeGreaterThanOrEqual(selected[2].score.total);
  });

  it("does not reserve slots by ticket class", () => {
    const impulses = Array.from({ length: 8 }, (_, index) => candidate({
      itemId: `impulse-${index}`,
      shopId: `impulse-shop-${index}`,
      productName: `Produto Especial Econômico Modelo Z${index} Utilidade Doméstica`,
      currentPrice: 19 + index,
      sales: 20000 - index * 500,
      velocityInfo: { velocity_status: "computed", sales_velocity: 500 - index },
    }));
    const expensive = candidate({
      itemId: "premium",
      shopId: "premium-shop",
      productName: "Smart TV 4K 65 Polegadas",
      currentPrice: 2200,
      sales: 100,
      commissionRate: 3,
    });
    const pool = [...impulses, expensive];

    const selected = selectRadarVNext(pool, { maxProducts: 8 });

    expect(selected.filter((row: any) => Number(row.candidate.currentPrice) < 100).length).toBeGreaterThan(6);
  });

  it("applies store and functional-family diversity after score ordering", () => {
    const sameStore = Array.from({ length: 4 }, (_, index) => candidate({
      itemId: `same-store-${index}`,
      shopId: "same-store",
      currentPrice: 20 + index,
      sales: 25000 - index * 100,
    }));
    const otherStores = Array.from({ length: 4 }, (_, index) => candidate({
      itemId: `other-${index}`,
      shopId: `other-shop-${index}`,
      productName: "Mixer Elétrico Portátil 2 em 1",
      currentPrice: 25 + index,
      sales: 15000 - index * 100,
    }));

    const selected = selectRadarVNext([...sameStore, ...otherStores], { maxProducts: 6 });

    expect(selected.filter((row: any) => row.candidate.shopId === "same-store").length).toBeLessThanOrEqual(2);
    const familyCounts = new Map<string, number>();
    for (const row of selected) {
      if (!row.family.diversityKey) continue;
      const key = row.family.diversityKey;
      familyCounts.set(key, (familyCounts.get(key) || 0) + 1);
    }
    expect(Math.max(...familyCounts.values())).toBeLessThanOrEqual(3);
  });

  it("returns fewer than maxProducts when candidates do not reach minimum quality", () => {
    const weak = Array.from({ length: 20 }, (_, index) => candidate({
      itemId: `weak-${index}`,
      shopId: `weak-shop-${index}`,
      productName: "Camiseta Básica Lisa Masculina",
      currentPrice: 95,
      sales: 0,
      ratingStar: 3.6,
      commissionRate: 0,
      provenance: "shopee_openapi_productOfferV2",
    }));

    const selected = selectRadarVNext(weak, { maxProducts: 20, minScore: 50 });

    expect(selected.length).toBeLessThan(20);
    expect(selected.every((row: any) => row.score.total >= 50 && row.score.decision !== "IGNORAR")).toBe(true);
  });

  it("does not treat unclassified isolated products as one shared family", () => {
    const isolated = Array.from({ length: 5 }, (_, index) => candidate({
      itemId: `isolated-${index}`,
      shopId: `isolated-shop-${index}`,
      productName: `Produto Especial Modelo Z${index} Utilidade Doméstica`,
      currentPrice: 30 + index,
      sales: 12000 - index * 100,
      velocityInfo: { velocity_status: "computed", sales_velocity: 500 - index },
    }));

    const selected = selectRadarVNext(isolated, { maxProducts: 5 });

    expect(selected).toHaveLength(5);
    expect(selected.every((row: any) => row.family.diversityKey === null)).toBe(true);
  });
});
