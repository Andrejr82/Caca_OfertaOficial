import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  fetchExistingOfferIdentityKeys,
  filterCandidatesOutsidePreviousSnapshot,
  getMarketplaceIdentityKey,
} = require("../../../scripts/oracle-trends-radar-freshness.cjs");

function candidate(itemId: string, productName: string) {
  return {
    marketplace: "Shopee",
    itemId,
    productName,
  };
}

describe("Oracle Trends Radar fresh rotation", () => {
  it("excludes identities selected in the latest completed snapshot", () => {
    const repeatedA = candidate("100", "Campeão antigo A");
    const repeatedB = candidate("200", "Campeão antigo B");
    const freshA = candidate("300", "Produto novo A");
    const freshB = candidate("400", "Produto novo B");
    const previousSnapshotIdentityKeys = new Set([
      getMarketplaceIdentityKey(repeatedA),
      getMarketplaceIdentityKey(repeatedB),
    ]);

    const result = filterCandidatesOutsidePreviousSnapshot(
      [repeatedA, freshA, repeatedB, freshB],
      previousSnapshotIdentityKeys,
    );

    expect(result.fresh.map((item: { itemId: string }) => item.itemId)).toEqual(["300", "400"]);
    expect(result.excluded.map((item: { itemId: string }) => item.itemId)).toEqual(["100", "200"]);
  });

  it("uses marketplace plus native identity so equal ids from different marketplaces do not collide", () => {
    const shopee = { marketplace: "Shopee", itemId: "100", productName: "Produto" };
    const mercadoLivre = { marketplace: "Mercado Livre", itemId: "100", productName: "Produto" };

    expect(getMarketplaceIdentityKey(shopee)).not.toBe(getMarketplaceIdentityKey(mercadoLivre));
  });

  it("matches persisted offers in any status using their database identity columns", () => {
    const liveCandidate = { marketplace: "Shopee", itemId: "23394276680", productName: "Produto atual" };
    const approvedOffer = { platform: "Shopee", shopee_item_id: "23394276680", status: "approved" };

    expect(getMarketplaceIdentityKey(approvedOffer)).toBe(getMarketplaceIdentityKey(liveCandidate));
  });

  it("paginates all existing offers beyond the Supabase default row limit without filtering status", async () => {
    const rows = Array.from({ length: 1005 }, (_, index) => ({
      platform: "Shopee",
      shopee_item_id: String(index + 1),
      item_id: null,
      product_id: null,
      status: index % 2 === 0 ? "approved" : "rejected",
    }));
    const ranges: Array<[number, number]> = [];
    let statusFilterCalled = false;

    const client = {
      from(table: string) {
        expect(table).toBe("offers");
        return {
          select() {
            return this;
          },
          in() {
            statusFilterCalled = true;
            return this;
          },
          eq() {
            return this;
          },
          async range(from: number, to: number) {
            ranges.push([from, to]);
            return { data: rows.slice(from, to + 1), error: null };
          },
        };
      },
    };

    const keys = await fetchExistingOfferIdentityKeys(client, "tenant-1");

    expect(statusFilterCalled).toBe(false);
    expect(keys.size).toBe(1005);
    expect(keys.has("shopee:native:1005")).toBe(true);
    expect(ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("excludes a candidate when the same native identity already exists in offers", () => {
    const existing = candidate("23394276680", "Oferta antiga aprovada");
    const fresh = candidate("300", "Produto realmente novo");
    const existingOfferIdentityKeys = new Set([getMarketplaceIdentityKey(existing)]);

    const result = filterCandidatesOutsidePreviousSnapshot([existing, fresh], existingOfferIdentityKeys);

    expect(result.fresh.map((item: { itemId: string }) => item.itemId)).toEqual(["300"]);
    expect(result.excluded.map((item: { itemId: string }) => item.itemId)).toEqual(["23394276680"]);
  });

  it("keeps candidates without an excluded identity instead of manufacturing novelty", () => {
    const fresh = candidate("300", "Produto novo");
    const result = filterCandidatesOutsidePreviousSnapshot([fresh], new Set());

    expect(result.fresh).toEqual([fresh]);
    expect(result.excluded).toEqual([]);
  });
});
