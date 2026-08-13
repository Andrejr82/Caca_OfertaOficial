import { ShopeeRankedCandidate, ShopeeSearchRequest, RejectionCode, CommercialFiltersConfig } from './types';
import { normalizePrice, normalizePercent, normalizeText, buildIdentity, isValidHttpsUrl } from './normalization';
import { getPolicyForCategory } from './category-policies';
import { evaluateSemanticConfidence } from './semantic-validator';
import { DEFAULT_COMMERCIAL_FILTERS, evaluateCommercialFilters } from './commercial-filters';
import { calculateScore, sortCandidatesDeterministic } from './score';

// Interface that matches the raw shape from Shopee Open API (productOfferV2)
export interface RawShopeeOffer {
  itemId?: string | number;
  shopId?: string | number;
  productName?: string;
  productLink?: string;
  offerLink?: string;
  imageUrl?: string;
  priceMin?: string | number;
  priceMax?: string | number;
  ratingStar?: string | number;
  sales?: string | number;
  priceDiscountRate?: string | number;
  commissionRate?: string | number;
  shopeeCommissionRate?: string | number;
  sellerCommissionRate?: string | number;
  shopType?: number;
  productCatIds?: string;
}

export interface ProcessedCandidate {
  candidate: ShopeeRankedCandidate;
  isValid: boolean;
  rejectionCode?: RejectionCode;
  reason?: string;
}

export function processRawOffers(
  rawOffers: RawShopeeOffer[],
  request: ShopeeSearchRequest,
  queryTerm: string,
  capturedAt: string,
  filters: CommercialFiltersConfig = DEFAULT_COMMERCIAL_FILTERS
): ProcessedCandidate[] {
  
  const policy = getPolicyForCategory(request.categoryKey);
  const processed: ProcessedCandidate[] = [];
  
  // To avoid duplicates by shopId:itemId
  const seenIdentities = new Set<string>();
  
  for (const raw of rawOffers) {
    const shopId = String(raw.shopId || '');
    const itemId = String(raw.itemId || '');
    const identity = buildIdentity(shopId, itemId);
    
    if (!identity || seenIdentities.has(identity)) {
      processed.push({
        candidate: createBaseCandidate(raw, request, queryTerm, capturedAt, shopId, itemId),
        isValid: false,
        rejectionCode: !identity ? 'missing_native_identity' : 'duplicate_product',
        reason: !identity ? 'Identidade nativa ausente' : 'Produto duplicado no lote'
      });
      continue;
    }
    seenIdentities.add(identity);
    
    const candidate = createBaseCandidate(raw, request, queryTerm, capturedAt, shopId, itemId);
    
    // 1. Semantic Validation
    const semanticResult = evaluateSemanticConfidence(candidate.productName, candidate.queryTerm, policy);
    candidate.semanticConfidence = semanticResult.confidence;
    
    if (!semanticResult.isValid) {
      processed.push({
        candidate,
        isValid: false,
        rejectionCode: semanticResult.rejectionCode,
        reason: semanticResult.reason
      });
      continue;
    }
    
    // 2. Commercial Filters
    const commercialResult = evaluateCommercialFilters(candidate, filters);
    if (!commercialResult.isValid) {
      processed.push({
        candidate,
        isValid: false,
        rejectionCode: commercialResult.rejectionCode,
        reason: commercialResult.reason
      });
      continue;
    }
    
    // 3. Valid Candidate!
    processed.push({
      candidate,
      isValid: true
    });
  }
  
  // Calculate median price for valid candidates to use in scoring
  const validCandidates = processed.filter(p => p.isValid).map(p => p.candidate);
  const medianPrice = calculateMedianPrice(validCandidates);
  
  // 4. Score Calculation for Valid Candidates
  for (const p of processed) {
    if (p.isValid) {
      const { score, breakdown, reasons } = calculateScore(p.candidate, medianPrice, true, filters);
      p.candidate.score = score;
      p.candidate.scoreBreakdown = breakdown;
      p.candidate.determiningReasons = reasons;
    }
  }
  
  return processed;
}

export function rankAndSelectTop(
  processedCandidates: ProcessedCandidate[],
  maximumResults: number = 2
): ShopeeRankedCandidate[] {
  const valid = processedCandidates.filter(p => p.isValid).map(p => p.candidate);
  valid.sort(sortCandidatesDeterministic);
  return valid.slice(0, maximumResults);
}

// Helpers
function createBaseCandidate(
  raw: RawShopeeOffer, 
  request: ShopeeSearchRequest, 
  queryTerm: string, 
  capturedAt: string,
  shopId: string,
  itemId: string
): ShopeeRankedCandidate {
  return {
    marketplace: 'Shopee',
    strategyVersion: 'shopee-ranking-v1',
    itemId,
    shopId,
    productName: raw.productName || '',
    categoryId: raw.productCatIds || null,
    categoryKey: request.categoryKey,
    queryTerm,
    productUrl: isValidHttpsUrl(raw.productLink) ? raw.productLink! : null,
    affiliateUrl: raw.offerLink || '',
    imageUrl: raw.imageUrl || null,
    currentPrice: normalizePrice(raw.priceMin),
    maximumPrice: raw.priceMax ? normalizePrice(raw.priceMax) : null,
    rating: normalizePrice(raw.ratingStar),
    sales: normalizePrice(raw.sales), // using normalizePrice as it handles number parsing
    discountPercent: normalizePercent(raw.priceDiscountRate),
    commissionPercent: normalizePercent(raw.commissionRate),
    shopeeCommissionPercent: raw.shopeeCommissionRate ? normalizePercent(raw.shopeeCommissionRate) : null,
    sellerCommissionPercent: raw.sellerCommissionRate ? normalizePercent(raw.sellerCommissionRate) : null,
    shopTypes: typeof raw.shopType === 'number' ? [raw.shopType] : (raw.shopType ? [parseInt(String(raw.shopType), 10)] : []),
    semanticConfidence: 0,
    score: 0,
    scoreBreakdown: {},
    determiningReasons: [],
    capturedAt
  };
}

function calculateMedianPrice(candidates: ShopeeRankedCandidate[]): number {
  if (candidates.length === 0) return 0;
  const prices = candidates.map(c => c.currentPrice).sort((a, b) => a - b);
  const mid = Math.floor(prices.length / 2);
  if (prices.length % 2 !== 0) return prices[mid];
  return (prices[mid - 1] + prices[mid]) / 2.0;
}
