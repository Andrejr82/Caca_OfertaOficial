import { getPolicyForCategory } from './category-policies';
import { evaluateCommercialFilters, DEFAULT_COMMERCIAL_FILTERS } from './commercial-filters';
import { normalizePercent } from './normalization';
import { calculateScore } from './score';
import { evaluateSemanticConfidence } from './semantic-validator';
import type { RejectionCode, ShopeeRankedCandidate } from './types';

export interface OracleCandidateInput {
  marketplace: string;
  sourceItemId: string;
  title: string;
  sourceUrl?: string | null;
  currentPrice: number;
  originalPrice?: number | null;
  category: { id?: string; name?: string };
  marketplaceMetrics?: {
    rating?: number;
    sales?: number;
    shopId?: string | number;
    shopType?: number | number[];
    commissionRate?: string | number;
  };
  intent?: string;
  capturedAt?: string;
}

export interface OracleRankingResult {
  eligible: boolean;
  score: number;
  scoreBreakdown?: Record<string, number>;
  rejectionCode?: RejectionCode | 'unsupported_marketplace';
  reasons: string[];
  strategyVersion: string;
}

export function evaluateShopeeOracleCandidate(
  input: OracleCandidateInput,
  medianPrice = 0,
  isFreshCapture = true,
): OracleRankingResult {
  const strategyVersion = 'shopee-ranking-v1';
  if (input.marketplace.toLowerCase() !== 'shopee') {
    return { eligible: false, score: 0, rejectionCode: 'unsupported_marketplace', reasons: ['Marketplace não suportado pelo Motor V1'], strategyVersion };
  }

  const categoryKey = input.intent || input.category.name || 'geral';
  const originalPrice = input.originalPrice ?? null;
  const candidate: Partial<ShopeeRankedCandidate> = {
    marketplace: 'Shopee', strategyVersion, itemId: input.sourceItemId,
    shopId: String(input.marketplaceMetrics?.shopId ?? ''), productName: input.title,
    categoryId: input.category.id ?? null, categoryKey, queryTerm: categoryKey,
    productUrl: null, affiliateUrl: input.sourceUrl ?? '', imageUrl: null,
    currentPrice: input.currentPrice, maximumPrice: originalPrice,
    discountPercent: originalPrice && originalPrice > input.currentPrice
      ? ((originalPrice - input.currentPrice) / originalPrice) * 100 : 0,
    rating: Number(input.marketplaceMetrics?.rating ?? 0),
    sales: Number(input.marketplaceMetrics?.sales ?? 0),
    commissionPercent: normalizePercent(input.marketplaceMetrics?.commissionRate),
    shopeeCommissionPercent: null, sellerCommissionPercent: null,
    shopTypes: Array.isArray(input.marketplaceMetrics?.shopType)
      ? input.marketplaceMetrics.shopType : input.marketplaceMetrics?.shopType == null
        ? [] : [input.marketplaceMetrics.shopType],
    semanticConfidence: 0, score: 0, scoreBreakdown: {}, determiningReasons: [],
    capturedAt: input.capturedAt ?? '',
  };

  const semantic = evaluateSemanticConfidence(input.title, categoryKey, getPolicyForCategory(categoryKey));
  candidate.semanticConfidence = semantic.confidence;
  if (!semantic.isValid) return { eligible: false, score: 0, rejectionCode: semantic.rejectionCode, reasons: [semantic.reason || 'Rejeitado na validação semântica'], strategyVersion };

  const commercial = evaluateCommercialFilters(candidate, DEFAULT_COMMERCIAL_FILTERS);
  if (!commercial.isValid) return { eligible: false, score: 0, rejectionCode: commercial.rejectionCode, reasons: [commercial.reason || 'Rejeitado nos filtros comerciais'], strategyVersion };

  const scored = calculateScore(candidate, medianPrice, isFreshCapture, DEFAULT_COMMERCIAL_FILTERS);
  return { eligible: true, score: scored.score, scoreBreakdown: scored.breakdown, reasons: scored.reasons, strategyVersion };
}
