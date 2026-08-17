import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
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

  it("keeps candidates without a previous-snapshot match instead of manufacturing novelty", () => {
    const fresh = candidate("300", "Produto novo");
    const result = filterCandidatesOutsidePreviousSnapshot([fresh], new Set());

    expect(result.fresh).toEqual([fresh]);
    expect(result.excluded).toEqual([]);
  });
});
