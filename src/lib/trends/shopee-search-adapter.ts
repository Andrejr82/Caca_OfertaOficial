import type { TrendOfferCandidate } from "@/core/trends/offer-matching";
import { processRawOffers, rankAndSelectTop, RawShopeeOffer } from "@/lib/shopee/ranking/search-service";
import { ShopeeRankedCandidate } from "@/lib/shopee/ranking/types";

export interface ShopeeOfficialNode {
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

export function mapRankedCandidatesToTrend(candidates: ShopeeRankedCandidate[]): TrendOfferCandidate[] {
  return candidates.map((candidate) => {
    return {
      id: candidate.itemId,
      marketplace: "Shopee",
      productName: candidate.productName,
      currentPrice: candidate.currentPrice,
      oldPrice: candidate.maximumPrice,
      itemId: candidate.itemId,
      shopeeItemId: candidate.itemId,
      permalink: candidate.affiliateUrl || candidate.productUrl,
      marketplaceMetrics: {
        shopId: candidate.shopId,
        imageUrl: candidate.imageUrl,
        affiliateUrl: candidate.affiliateUrl,
        productLink: candidate.productUrl,
        priceMax: candidate.maximumPrice,
        rating: candidate.rating,
        sales: candidate.sales,
        discount: candidate.discountPercent,
        commissionRate: candidate.commissionPercent,
        shopeeCommissionRate: candidate.shopeeCommissionPercent,
        sellerCommissionRate: candidate.sellerCommissionPercent,
        // Novos campos V1
        strategy_version: candidate.strategyVersion,
        score: candidate.score,
        semanticConfidence: candidate.semanticConfidence,
        scoreBreakdown: candidate.scoreBreakdown,
        determiningReasons: candidate.determiningReasons,
        capturedAt: candidate.capturedAt,
      }
    };
  });
}

/** Thin Radar adapter over the existing signed Shopee OpenAPI V1 contract. */
export async function searchShopeeOfficialV1(query: string, categoryKey: string = 'geral'): Promise<TrendOfferCandidate[]> {
  const startMs = Date.now();
  const appId = process.env.SHOPEE_APP_ID;
  const appSecret = process.env.SHOPEE_APP_SECRET;
  
  if (!appId || !appSecret) throw new Error("Shopee OpenAPI V1 não configurada.");
  
  const shopeeV1 = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    createSignedRequest(input: { appId: string; appSecret: string; request: (input: { body: string; headers: Record<string, string> }) => Promise<{ status: number; data: unknown }> }): (operation: string, query: string, variables: Record<string, unknown>) => Promise<{ status: number; data: any }>;
    GRAPHQL_CONTRACTS: { productOfferV2: { query: string } };
  };
  
  const request = shopeeV1.createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", { 
        method: "POST", 
        headers, 
        body, 
        signal: AbortSignal.timeout(30_000) 
      });
      return { status: response.status, data: await response.json() };
    }
  });

  const response = await request("ShopeePromotionOffers", shopeeV1.GRAPHQL_CONTRACTS.productOfferV2.query, { 
    keyword: query, 
    page: 1, 
    limit: 20, 
    sortType: 2, 
    isAMSOffer: true 
  });
  
  if (response.status !== 200 || response.data?.errors?.length) {
    throw new Error(`Shopee OpenAPI V1 HTTP ${response.status}`);
  }

  const rawNodes: RawShopeeOffer[] = response.data?.data?.productOfferV2?.nodes ?? [];
  const capturedAt = new Date().toISOString();
  
  const processed = processRawOffers(
    rawNodes,
    { scenarioId: 'search', categoryKey },
    query,
    capturedAt
  );
  
  const durationMs = Date.now() - startMs;
  const approved = processed.filter(p => p.isValid).length;
  const rejected = processed.filter(p => !p.isValid).length;
  const rejectionCounts = processed.reduce((acc, p) => {
    if (!p.isValid && p.rejectionCode) {
      acc[p.rejectionCode] = (acc[p.rejectionCode] || 0) + 1;
    }
    return acc;
  }, {} as Record<string, number>);
  const top_rejection_codes = Object.entries(rejectionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(e => e[0]);

  console.log(JSON.stringify({
    event: "shopee_search_completed",
    strategy_version: "shopee-ranking-v1",
    scenario_id: query,
    category_key: categoryKey,
    received: processed.length,
    approved,
    rejected,
    top_rejection_codes,
    duration_ms: durationMs
  }));

  const ranked = rankAndSelectTop(processed, 2);
  return mapRankedCandidatesToTrend(ranked);
}
