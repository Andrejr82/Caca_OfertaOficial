import type { TrendOfferCandidate } from "@/core/trends/offer-matching";

export interface ExistingMercadoLivreProduct {
  id?: string | null;
  item_id?: string | null;
  product_id?: string | null;
  catalog_product_id?: string | null;
  title?: string | null;
  current_price?: number | string | null;
  price?: number | string | null;
  old_price?: number | string | null;
  original_price?: number | string | null;
  product_url?: string | null;
  permalink?: string | null;
  image_url?: string | null;
  imageUrl?: string | null;
  affiliate_url?: string | null;
  affiliateUrl?: string | null;
  seller_id?: string | null;
  seller_reputation?: Record<string, unknown> | null;
  official_store_id?: string | null;
  source_position?: number | null;
  best_seller?: boolean | null;
  ranking?: number | null;
}

export interface ExistingMercadoLivreSearchService {
  runMercadoLivreOfficialIntentCoverage(input: {
    keywords: string[];
    accessToken: string;
    maxPerIntent: number;
    delayMs: number;
  }): Promise<{ products?: ExistingMercadoLivreProduct[] }>;
}

interface MercadoLivreSearchResponse {
  results?: Array<Record<string, unknown>>;
}

export function createMercadoLivreOfficialSearchService(): ExistingMercadoLivreSearchService {
  return {
    async runMercadoLivreOfficialIntentCoverage({ keywords, accessToken, maxPerIntent, delayMs }) {
      const products: ExistingMercadoLivreProduct[] = [];
      for (const keyword of keywords.slice(0, 10)) {
        if (delayMs > 0 && products.length > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const url = new URL("https://api.mercadolibre.com/sites/MLB/search");
        url.searchParams.set("q", keyword);
        url.searchParams.set("limit", String(Math.min(50, Math.max(1, Math.trunc(maxPerIntent)))));
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
          signal: AbortSignal.timeout(15_000)
        });
        if (!response.ok) throw new Error(`Mercado Livre search failed with status ${response.status}`);
        const payload = await response.json() as MercadoLivreSearchResponse;
        for (const [index, item] of (payload.results ?? []).entries()) {
          products.push({
            item_id: text(item.id),
            title: text(item.title),
            price: numeric(item.price),
            original_price: numeric(item.original_price),
            permalink: text(item.permalink),
            image_url: text(item.thumbnail),
            seller_id: text(item.seller_id),
            source_position: index + 1
          });
        }
      }
      return { products };
    }
  };
}

export interface MercadoLivreTrendSearchOptions {
  maxPerIntent?: number;
  delayMs?: number;
  maxQueries?: number;
}

const DEFAULT_SEARCH_OPTIONS: Required<MercadoLivreTrendSearchOptions> = {
  maxPerIntent: 20,
  delayMs: 0,
  maxQueries: 3
};

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value as number)));
}

function normalizeSearchOptions(options: MercadoLivreTrendSearchOptions = {}): Required<MercadoLivreTrendSearchOptions> {
  return {
    maxPerIntent: boundedInteger(options.maxPerIntent, DEFAULT_SEARCH_OPTIONS.maxPerIntent, 1, 50),
    delayMs: boundedInteger(options.delayMs, DEFAULT_SEARCH_OPTIONS.delayMs, 0, 30_000),
    maxQueries: boundedInteger(options.maxQueries, DEFAULT_SEARCH_OPTIONS.maxQueries, 1, 10)
  };
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function numeric(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

export function mapMercadoLivreProductsToTrendCandidates(
  normalizedProductTerm: string,
  products: ExistingMercadoLivreProduct[]
): TrendOfferCandidate[] {
  return products.flatMap((product) => {
    const productId = text(product.product_id) || text(product.catalog_product_id);
    const itemId = text(product.item_id) || text(product.id) || productId;
    const productName = text(product.title);
    if (!itemId || !productName) return [];

    return [{
      id: itemId,
      marketplace: "Mercado Livre",
      productName,
      category: null,
      currentPrice: numeric(product.current_price ?? product.price),
      oldPrice: numeric(product.old_price ?? product.original_price),
      itemId,
      productId,
      permalink: text(product.permalink) || text(product.product_url),
      marketplaceMetrics: {
        sellerId: text(product.seller_id),
        sellerReputation: product.seller_reputation ?? null,
        officialStoreId: text(product.official_store_id),
        sourcePosition: product.source_position ?? null,
        bestSeller: product.best_seller ?? null,
        ranking: product.ranking ?? null,
        imageUrl: text(product.imageUrl) || text(product.image_url),
        affiliateUrl: text(product.affiliateUrl) || text(product.affiliate_url) || text(product.permalink) || text(product.product_url),
        normalizedProductTerm
      }
    }];
  });
}

export async function searchMercadoLivreForTrendTerm(
  service: ExistingMercadoLivreSearchService,
  normalizedProductTerm: string,
  accessToken: string,
  options: MercadoLivreTrendSearchOptions = {}
): Promise<TrendOfferCandidate[]> {
  const searchOptions = normalizeSearchOptions(options);
  const result = await service.runMercadoLivreOfficialIntentCoverage({
    keywords: [normalizedProductTerm],
    accessToken,
    maxPerIntent: searchOptions.maxPerIntent,
    delayMs: searchOptions.delayMs
  });
  return mapMercadoLivreProductsToTrendCandidates(normalizedProductTerm, result.products ?? []);
}

export async function searchMercadoLivreForTrendQueries(
  service: ExistingMercadoLivreSearchService,
  queries: string[],
  accessToken: string,
  options: MercadoLivreTrendSearchOptions = {}
): Promise<TrendOfferCandidate[]> {
  const searchOptions = normalizeSearchOptions(options);
  const results = await Promise.all(queries.slice(0, searchOptions.maxQueries).map((query) => searchMercadoLivreForTrendTerm(service, query, accessToken, searchOptions)));
  const seen = new Set<string>();
  return results.flat().filter((candidate) => {
    const identity = `${candidate.marketplace}:${candidate.id}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
