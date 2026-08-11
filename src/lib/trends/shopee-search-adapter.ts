import type { TrendOfferCandidate } from "@/core/trends/offer-matching";

interface ShopeeOfficialNode {
  itemId?: string | number | null;
  shopId?: string | number | null;
  productName?: string | null;
  productLink?: string | null;
  offerLink?: string | null;
  imageUrl?: string | null;
  priceMin?: number | string | null;
  priceMax?: number | string | null;
  ratingStar?: number | string | null;
  sales?: number | string | null;
  priceDiscountRate?: number | string | null;
  commissionRate?: number | string | null;
  shopeeCommissionRate?: number | string | null;
  sellerCommissionRate?: number | string | null;
  shopName?: string | null;
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function numeric(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function mapShopeeProductsToTrendCandidates(products: ShopeeOfficialNode[]): TrendOfferCandidate[] {
  return products.flatMap((product) => {
    const itemId = text(product.itemId);
    const productName = text(product.productName);
    if (!itemId || !productName) return [];
    return [{
      id: itemId,
      marketplace: "Shopee",
      productName,
      currentPrice: numeric(product.priceMin),
      oldPrice: null,
      itemId,
      shopeeItemId: itemId,
      permalink: text(product.offerLink) || text(product.productLink),
      marketplaceMetrics: {
        shopId: text(product.shopId),
        shopName: text(product.shopName),
        imageUrl: text(product.imageUrl),
        priceMax: numeric(product.priceMax),
        rating: numeric(product.ratingStar),
        sales: numeric(product.sales),
        discount: numeric(product.priceDiscountRate),
        commissionRate: numeric(product.commissionRate),
        shopeeCommissionRate: numeric(product.shopeeCommissionRate),
        sellerCommissionRate: numeric(product.sellerCommissionRate),
      }
    }];
  });
}

/** Thin Radar adapter over the existing signed Shopee OpenAPI V1 contract. */
export async function searchShopeeOfficialV1(query: string): Promise<TrendOfferCandidate[]> {
  const appId = process.env.SHOPEE_APP_ID;
  const appSecret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Shopee OpenAPI V1 não configurada.");
  // The maintained V1 contract owns signature generation and GraphQL shape.
  const shopeeV1 = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    createSignedRequest(input: { appId: string; appSecret: string; request: (input: { body: string; headers: Record<string, string> }) => Promise<{ status: number; data: unknown }> }): (operation: string, query: string, variables: Record<string, unknown>) => Promise<{ status: number; data: any }>;
    GRAPHQL_CONTRACTS: { productOfferV2: { query: string } };
  };
  const request = shopeeV1.createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", { method: "POST", headers, body, signal: AbortSignal.timeout(30_000) });
      return { status: response.status, data: await response.json() };
    }
  });
  const response = await request("ShopeePromotionOffers", shopeeV1.GRAPHQL_CONTRACTS.productOfferV2.query, { keyword: query, page: 1, limit: 20, sortType: 2, isAMSOffer: true });
  if (response.status !== 200 || response.data?.errors?.length) throw new Error(`Shopee OpenAPI V1 HTTP ${response.status}`);
  return mapShopeeProductsToTrendCandidates(response.data?.data?.productOfferV2?.nodes ?? []);
}
