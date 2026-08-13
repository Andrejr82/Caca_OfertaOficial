export interface ShopeeRankedCandidate {
  marketplace: 'Shopee';
  strategyVersion: 'shopee-ranking-v1';
  itemId: string;
  shopId: string;
  productName: string;
  categoryId: string | null;
  categoryKey: string;
  queryTerm: string;
  productUrl: string | null;
  affiliateUrl: string;
  imageUrl: string | null;
  currentPrice: number;
  maximumPrice: number | null;
  rating: number;
  sales: number;
  discountPercent: number;
  commissionPercent: number;
  shopeeCommissionPercent: number | null;
  sellerCommissionPercent: number | null;
  shopTypes: number[];
  semanticConfidence: number;
  score: number;
  scoreBreakdown: Record<string, number>;
  determiningReasons: string[];
  capturedAt: string;
}

export interface CategoryPolicy {
  categoryKey: string;
  primaryClasses: string[];
  acceptedAliases: string[];
  blockedTerms: string[];
  nativeCategoryIds: string[];
  exceptions?: string[];
}

export type RejectionCode =
  | 'missing_native_identity'
  | 'missing_affiliate_url'
  | 'invalid_price'
  | 'semantic_mismatch'
  | 'accessory_mismatch'
  | 'native_category_mismatch'
  | 'rating_below_threshold'
  | 'sales_below_threshold'
  | 'commission_below_threshold'
  | 'duplicate_product';

export interface SemanticValidationResult {
  confidence: number;
  isValid: boolean;
  rejectionCode?: RejectionCode;
  reason?: string;
}

export interface CommercialFiltersConfig {
  minPrice: number;
  minSemanticRelevance: number;
  minRating: number;
  minSales: number;
  minCommissionPercent: number;
  bonusShopTypes: number[];
}

export interface ShopeeSearchRequest {
  scenarioId: string;
  categoryKey: string;
  limitPerQuery?: number;
  maximumPages?: number;
  maximumResults?: number;
  strategyVersion?: string;
}
