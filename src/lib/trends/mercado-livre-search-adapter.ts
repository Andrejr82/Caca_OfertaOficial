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
    const itemId = text(product.item_id) || text(product.id);
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
      productId: text(product.product_id) || text(product.catalog_product_id),
      permalink: text(product.permalink) || text(product.product_url),
      marketplaceMetrics: {
        sellerId: text(product.seller_id),
        sellerReputation: product.seller_reputation ?? null,
        officialStoreId: text(product.official_store_id),
        sourcePosition: product.source_position ?? null,
        bestSeller: product.best_seller ?? null,
        ranking: product.ranking ?? null,
        normalizedProductTerm
      }
    }];
  });
}

export async function searchMercadoLivreForTrendTerm(
  service: ExistingMercadoLivreSearchService,
  normalizedProductTerm: string,
  accessToken: string
): Promise<TrendOfferCandidate[]> {
  const result = await service.runMercadoLivreOfficialIntentCoverage({
    keywords: [normalizedProductTerm],
    accessToken,
    maxPerIntent: 20,
    delayMs: 0
  });
  return mapMercadoLivreProductsToTrendCandidates(normalizedProductTerm, result.products ?? []);
}
