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
    const affiliateUrl = text(product.offerLink);
    const productLink = text(product.productLink);
    return [{
      id: itemId,
      marketplace: "Shopee",
      productName,
      currentPrice: numeric(product.priceMin),
      oldPrice: null,
      itemId,
      shopeeItemId: itemId,
      permalink: affiliateUrl || productLink,
      marketplaceMetrics: {
        shopId: text(product.shopId),
        shopName: text(product.shopName),
        imageUrl: text(product.imageUrl),
        affiliateUrl,
        productLink,
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

export interface ShopeeSearchOptions {
  page?: number;
  limit?: number;
  sortType?: number;
  isAMSOffer?: boolean;
  maxPages?: number;
  request?: ShopeeSignedRequest;
}

export interface ShopeePageInfo {
  page: number;
  limit: number;
  hasNextPage: boolean;
}

export interface ShopeePaginatedSearchResult {
  candidates: TrendOfferCandidate[];
  pagesFetched: number;
}

export type ShopeeSignedRequest = (
  operation: string,
  query: string,
  variables: Record<string, unknown>,
) => Promise<{ status: number; data: any }>;

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function buildShopeeSearchVariables(query: string, options: ShopeeSearchOptions = {}) {
  return {
    keyword: query.trim(),
    page: boundedInteger(options.page, 1, 1, 100),
    limit: boundedInteger(options.limit, 20, 1, 50),
    sortType: boundedInteger(options.sortType, 2, 1, 10),
    isAMSOffer: options.isAMSOffer ?? true,
  };
}

function createDefaultShopeeRequest(): ShopeeSignedRequest {
  const appId = process.env.SHOPEE_APP_ID;
  const appSecret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Shopee OpenAPI V1 não configurada.");
  // The maintained V1 contract owns signature generation and GraphQL shape.
  const shopeeV1 = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    createSignedRequest(input: { appId: string; appSecret: string; request: (input: { body: string; headers: Record<string, string> }) => Promise<{ status: number; data: unknown }> }): (operation: string, query: string, variables: Record<string, unknown>) => Promise<{ status: number; data: any }>;
    GRAPHQL_CONTRACTS: { productOfferV2: { query: string } };
  };
  return shopeeV1.createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", { method: "POST", headers, body, signal: AbortSignal.timeout(30_000) });
      return { status: response.status, data: await response.json() };
    }
  });
}

async function searchShopeeOfficialV1Page(query: string, options: ShopeeSearchOptions = {}) {
  const shopeeV1 = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    GRAPHQL_CONTRACTS: { productOfferV2: { query: string } };
  };
  const request = options.request ?? createDefaultShopeeRequest();
  const variables = buildShopeeSearchVariables(query, options);
  const response = await request("ShopeePromotionOffers", shopeeV1.GRAPHQL_CONTRACTS.productOfferV2.query, variables);
  if (response.status !== 200 || response.data?.errors?.length) throw new Error(`Shopee OpenAPI V1 HTTP ${response.status}`);
  const productOffer = response.data?.data?.productOfferV2;
  const pageInfo = productOffer?.pageInfo;
  return {
    candidates: mapShopeeProductsToTrendCandidates(productOffer?.nodes ?? []),
    pageInfo: {
      page: Number(pageInfo?.page ?? variables.page),
      limit: Number(pageInfo?.limit ?? variables.limit),
      hasNextPage: Boolean(pageInfo?.hasNextPage),
    } satisfies ShopeePageInfo,
  };
}

/** Thin Radar adapter over the existing signed Shopee OpenAPI V1 contract. */
export async function searchShopeeOfficialV1(query: string, options: ShopeeSearchOptions = {}): Promise<TrendOfferCandidate[]> {
  const page = await searchShopeeOfficialV1Page(query, options);
  return page.candidates;
}

export async function searchShopeeOfficialV1Paginated(
  query: string,
  options: ShopeeSearchOptions = {},
): Promise<ShopeePaginatedSearchResult> {
  const maxPages = boundedInteger(options.maxPages, 3, 1, 10);
  const candidates: TrendOfferCandidate[] = [];
  const seen = new Set<string>();
  let pagesFetched = 0;
  let page = boundedInteger(options.page, 1, 1, 100);

  for (let index = 0; index < maxPages; index += 1) {
    const result = await searchShopeeOfficialV1Page(query, { ...options, page });
    pagesFetched += 1;
    for (const candidate of result.candidates) {
      const identity = `${candidate.marketplace}:${candidate.shopeeItemId || candidate.itemId || candidate.id}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      candidates.push(candidate);
    }
    if (!result.pageInfo.hasNextPage) break;
    page += 1;
  }

  return { candidates, pagesFetched };
}
