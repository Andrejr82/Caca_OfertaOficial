import { describe, expect, it } from "vitest";
import {
  buildShopeeSearchVariables,
  mapShopeeProductsToTrendCandidates,
  searchShopeeOfficialV1Paginated,
} from "@/lib/trends/shopee-search-adapter";

function node(itemId: string) {
  return {
    itemId,
    shopId: "456",
    productName: "Power Bank " + itemId,
    offerLink: "https://s.shopee.com.br/" + itemId,
    imageUrl: "https://cf.shopee.com.br/" + itemId + ".jpg",
    priceMin: 49.9,
  };
}

describe("Trend → Shopee V1 paginated search", () => {
  it("builds bounded official query variables for a requested page", () => {
    expect(buildShopeeSearchVariables("power bank", { page: 3, limit: 25, sortType: 1 })).toEqual({
      keyword: "power bank",
      page: 3,
      limit: 25,
      sortType: 1,
      isAMSOffer: true,
    });
  });

  it("rotates pages, stops when the API has no next page and deduplicates item ids", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const result = await searchShopeeOfficialV1Paginated("power bank", {
      maxPages: 5,
      limit: 2,
      request: async (_operation, _query, variables) => {
        calls.push(variables);
        const page = Number(variables.page);
        return {
          status: 200,
          data: {
            data: {
              productOfferV2: {
                nodes: page === 1 ? [node("1"), node("2")] : [node("2"), node("3")],
                pageInfo: { page, limit: 2, hasNextPage: page === 1 },
              },
            },
          },
        };
      },
    });

    expect(calls.map((call) => call.page)).toEqual([1, 2]);
    expect(result.pagesFetched).toBe(2);
    expect(result.candidates.map((candidate) => candidate.shopeeItemId)).toEqual(["1", "2", "3"]);
  });

  it("preserves the existing candidate mapping fields", () => {
    const [candidate] = mapShopeeProductsToTrendCandidates([node("9")]);
    expect(candidate).toEqual(expect.objectContaining({
      id: "9",
      marketplace: "Shopee",
      currentPrice: 49.9,
      shopeeItemId: "9",
    }));
  });
});
