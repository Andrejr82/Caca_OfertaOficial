import { CommercialFiltersConfig, RejectionCode, ShopeeRankedCandidate } from './types';
import { isValidHttpsUrl } from './normalization';

export const DEFAULT_COMMERCIAL_FILTERS: CommercialFiltersConfig = {
  minPrice: 0,
  minSemanticRelevance: 0.50,
  minRating: 4.5,
  minSales: 10,
  minCommissionPercent: 3,
  bonusShopTypes: [1, 2, 4],
};

export function evaluateCommercialFilters(
  candidate: Partial<ShopeeRankedCandidate>,
  filters: CommercialFiltersConfig = DEFAULT_COMMERCIAL_FILTERS
): { isValid: boolean; rejectionCode?: RejectionCode; reason?: string } {

  if (!candidate.itemId || !candidate.shopId) {
    return { isValid: false, rejectionCode: 'missing_native_identity', reason: 'Falta itemId ou shopId' };
  }

  if (!isValidHttpsUrl(candidate.affiliateUrl)) {
    return { isValid: false, rejectionCode: 'missing_affiliate_url', reason: 'Link de afiliado inválido' };
  }

  if (candidate.currentPrice === undefined || candidate.currentPrice <= filters.minPrice) {
    return { isValid: false, rejectionCode: 'invalid_price', reason: 'Preço inválido ou abaixo do mínimo' };
  }

  if (candidate.semanticConfidence === undefined || candidate.semanticConfidence < filters.minSemanticRelevance) {
    return { isValid: false, rejectionCode: 'semantic_mismatch', reason: 'Relevância semântica abaixo do limite' };
  }

  if (candidate.rating === undefined || candidate.rating < filters.minRating) {
    return { isValid: false, rejectionCode: 'rating_below_threshold', reason: 'Avaliação abaixo do limite' };
  }

  if (candidate.sales === undefined || candidate.sales < filters.minSales) {
    return { isValid: false, rejectionCode: 'sales_below_threshold', reason: 'Vendas abaixo do limite' };
  }

  if (candidate.commissionPercent === undefined || candidate.commissionPercent < filters.minCommissionPercent) {
    return { isValid: false, rejectionCode: 'commission_below_threshold', reason: 'Comissão abaixo do limite' };
  }

  return { isValid: true };
}
