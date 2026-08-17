import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { collectShopeeMarketplaceCandidates } = require("../../../scripts/oracle-trends-radar-engine.cjs");

function node(itemId: string, shopId: string, productName: string) {
  return {
    itemId,
    shopId,
    productName,
    priceMin: "39.90",
    priceMax: "39.90",
    sales: "1000",
    ratingStar: "4.8",
    commissionRate: "10",
    sellerCommissionRate: "5",
    offerLink: `https://s.shopee.com.br/${shopId}-${itemId}`,
    imageUrl: `https://cf.shopee.com.br/file/${shopId}-${itemId}`,
  };
}

describe("Shopee discovery pool v2", () => {
  it("collects multiple official pages per category and deduplicates by shopId + itemId", async () => {
    const seenPages: number[] = [];
    const request = async (_operation: string, _query: string, variables: { page: number; limit: number; productCatId?: number }) => {
      seenPages.push(variables.page);
      expect(variables.limit).toBe(2);
      expect(variables.productCatId).toBe(100010);

      const pages: Record<number, ReturnType<typeof node>[]> = {
        1: [
          node("100", "shop-a", "Produto A"),
          node("200", "shop-b", "Produto B"),
        ],
        2: [
          node("100", "shop-a", "Produto A repetido"),
          node("300", "shop-c", "Produto C"),
        ],
      };

      return { data: { data: { productOfferV2: { nodes: pages[variables.page] ?? [] } } } };
    };

    const candidates = await collectShopeeMarketplaceCandidates({
      request,
      categoryIds: [100010],
      maxPerCategory: 2,
      maxPagesPerCategory: 2,
    });

    expect(seenPages).toEqual([1, 2]);
    expect(candidates.map((candidate: { itemId: string }) => candidate.itemId)).toEqual(["100", "200", "300"]);
  });

  it("stops paging a category when an official page returns no nodes", async () => {
    const seenPages: number[] = [];
    const request = async (_operation: string, _query: string, variables: { page: number }) => {
      seenPages.push(variables.page);
      return {
        data: {
          data: {
            productOfferV2: {
              nodes: variables.page === 1 ? [node("100", "shop-a", "Produto A")] : [],
            },
          },
        },
      };
    };

    const candidates = await collectShopeeMarketplaceCandidates({
      request,
      categoryIds: [100010],
      maxPerCategory: 30,
      maxPagesPerCategory: 4,
    });

    expect(seenPages).toEqual([1, 2]);
    expect(candidates).toHaveLength(1);
  });
});
