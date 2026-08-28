import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  fetchExistingOfferIdentityKeys,
  filterCandidatesOutsidePreviousSnapshot,
  getMarketplaceIdentityKey,
  getMarketplaceImageUrl,
  withMarketplaceImageEvidence,
} = require("../../../scripts/oracle-trends-radar-freshness.cjs");
const {
  buildTrendRadarProductsFromCandidates,
  collectShopeeMarketplaceCandidates,
  normalizeMercadoLivreRadarProduct,
} = require("../../../scripts/oracle-trends-radar-engine.cjs");

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

  it("paginates all commercially active existing offers beyond the Supabase default row limit", async () => {
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

    expect(statusFilterCalled).toBe(true);
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

  it("preserves an HTTPS marketplace image in persisted Radar evidence", () => {
    const candidateWithImage = {
      marketplace: "Shopee",
      itemId: "300",
      productName: "Produto com imagem",
      imageUrl: "https://cf.shopee.com.br/file/example.jpg",
    };
    const imageUrl = getMarketplaceImageUrl(candidateWithImage);
    const evidence = withMarketplaceImageEvidence([
      { marketplace_identity: { itemId: "300" }, source_url: "https://s.shopee.com.br/example" },
    ], imageUrl);

    expect(imageUrl).toBe("https://cf.shopee.com.br/file/example.jpg");
    expect(evidence[0].image_url).toBe("https://cf.shopee.com.br/file/example.jpg");
  });

  it("rejects non-HTTPS image URLs from Radar evidence", () => {
    expect(getMarketplaceImageUrl({ imageUrl: "http://example.com/image.jpg" })).toBeNull();
  });

  it("requests a deeper Shopee candidate pool without weakening novelty gates", async () => {
    const seenLimits: number[] = [];
    const request = async (_operation: string, _query: string, variables: { limit: number }) => {
      seenLimits.push(variables.limit);
      return { data: { data: { productOfferV2: { nodes: [] } } } };
    };

    await collectShopeeMarketplaceCandidates({ request, categoryIds: [100010] });

    expect(seenLimits).toEqual([40]);
  });

  it("does not treat Shopee priceMax as previous price or raw discount as verified", async () => {
    const request = async () => ({
      data: {
        data: {
          productOfferV2: {
            nodes: [{
              itemId: "22599466714",
              shopId: "432679242",
              productName: "Papa Bolinhas Elétrico",
              priceMin: "23.66",
              priceMax: "24.88",
              priceDiscountRate: "41",
              sales: "7242",
              ratingStar: "4.8",
              commissionRate: "9",
              sellerCommissionRate: "6",
              offerLink: "https://s.shopee.com.br/example",
              imageUrl: "https://cf.shopee.com.br/file/example",
            }],
          },
        },
      },
    });

    const [normalized] = await collectShopeeMarketplaceCandidates({ request, categoryIds: [100010] });

    expect(normalized).toMatchObject({
      currentPrice: 23.66,
      oldPrice: null,
      discountPercent: 0,
      priceDiscountRate: 0,
      marketplaceReportedDiscountPercent: 41,
      priceRangeAmbiguous: true,
      priceAuthority: "priceMin",
      oldPriceAuthority: "none",
      discountAuthority: "none",
    });
  });

  it("maps Mercado Livre normalized price fields instead of manufacturing zero values", () => {
    const normalized = normalizeMercadoLivreRadarProduct({
      item_id: "MLB123",
      product_id: "MLB456",
      title: "Smart TV",
      category_name: "Televisores",
      current_price: 1499.9,
      old_price: 1899.9,
      discount_percent: 21.05,
      sold_quantity: 321,
      rating: 4.8,
      product_url: "https://www.mercadolivre.com.br/p/MLB456",
      image_url: "https://http2.mlstatic.com/example.jpg",
    }, "2026-08-17T03:00:00.000Z");

    expect(normalized).toMatchObject({
      marketplace: "Mercado Livre",
      itemId: "MLB123",
      productId: "MLB456",
      currentPrice: 1499.9,
      oldPrice: 1899.9,
      sales: 321,
      rating: 4.8,
      ratingStar: 4.8,
    });
  });

  it("keeps unavailable Mercado Livre demand and rating as null in persisted evidence", () => {
    const normalized = normalizeMercadoLivreRadarProduct({
      item_id: "MLB789",
      product_id: "MLB999",
      title: "Notebook",
      category_name: "Notebooks",
      current_price: 3299,
      old_price: 3999,
      sold_quantity: null,
      rating: null,
      product_url: "https://www.mercadolivre.com.br/p/MLB999",
      image_url: "https://http2.mlstatic.com/notebook.jpg",
    }, "2026-08-17T03:00:00.000Z");

    const [snapshot] = buildTrendRadarProductsFromCandidates({
      radarRunId: "run-1",
      shopeeCandidates: [],
      mlCandidates: [normalized],
      previousItemsMap: new Map(),
      maxProducts: 20,
      now: new Date("2026-08-17T03:00:00.000Z"),
    });

    expect(snapshot.direct_evidence[0].price).toBe(3299);
    expect(snapshot.direct_evidence[0].sold_quantity).toBeNull();
    expect(snapshot.direct_evidence[0].rating).toBeNull();
    expect(snapshot.direct_evidence[0].commercial_metrics.sales).toBeNull();
    expect(snapshot.direct_evidence[0].commercial_metrics.ratingStar).toBeNull();
  });

  it("keeps candidates without an excluded identity instead of manufacturing novelty", () => {
    const fresh = candidate("300", "Produto novo");
    const result = filterCandidatesOutsidePreviousSnapshot([fresh], new Set());

    expect(result.fresh).toEqual([fresh]);
    expect(result.excluded).toEqual([]);
  });
});
