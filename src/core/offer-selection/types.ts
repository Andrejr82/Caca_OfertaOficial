export const MARKETPLACES_V2 = ["Shopee", "Mercado Livre", "Amazon"] as const;
export type MarketplaceV2 = (typeof MARKETPLACES_V2)[number];

export type ProductRoleV2 =
  | "main_product"
  | "accessory"
  | "consumable"
  | "replacement"
  | "ambiguous";

export type ClassificationStatusV2 = "classified" | "review_required" | "excluded";

export type DiscountConfidenceV2 = "verified" | "unverified" | "none";

export type FreshnessStateV2 =
  | "new"
  | "known_unpublished"
  | "published_cooldown"
  | "material_change";

export type DecisionOutcomeV2 = "selected" | "deferred" | "review" | "rejected";

export interface CandidateEvidenceV2 {
  currentPrice: number;
  originalPrice: number | null;
  discountPercent: number | null;
  discountConfidence: DiscountConfidenceV2;
  rating: number | null;
  reviewCount: number | null;
  sales: number | null;
  shippingFree: boolean | null;
  officialStore: boolean | null;
  prime: boolean | null;
  coupon: boolean | null;
  monetizationValid: boolean;
  provenance: readonly string[];
}

export interface CandidateClassificationV2 {
  status: ClassificationStatusV2;
  productType: string | null;
}

export interface CandidateIdentityGroupV2 {
  exactKey: string;
  familyKey: string | null;
  crossMarketplaceKey: string | null;
  confidence: number;
}

export interface CandidateFreshnessV2 {
  state: FreshnessStateV2;
  eligible: boolean;
  reason: string;
}

export interface CandidateScoreV2 {
  total: number;
  semantic: number;
  evidence: number;
  value: number;
  logistics: number;
  freshness: number;
  version: string;
}

export interface CandidateReasonV2 {
  stage: string;
  code: string;
  message: string;
}

export interface CandidateTraceV2 {
  correlationId: string;
  discoveredAt: string;
  evaluatedAt: string;
}

export interface CandidateDecisionV2 {
  contractVersion: "candidate-decision/v2";
  candidateId: string;
  marketplace: MarketplaceV2;
  nativeIdentity: string;
  sourceItemId: string;
  sourceUrl: string;
  imageUrl: string;
  title: string;
  intentId: string | null;
  productRole: ProductRoleV2;
  classification: CandidateClassificationV2;
  identityGroup: CandidateIdentityGroupV2;
  evidence: CandidateEvidenceV2;
  freshness: CandidateFreshnessV2;
  decision: DecisionOutcomeV2;
  score: CandidateScoreV2;
  reasons: readonly CandidateReasonV2[];
  trace: CandidateTraceV2;
}

export interface RawCandidateInput {
  marketplace?: string | null;
  sourceItemId?: string | number | null;
  nativeIdentity?: string | null;
  title?: string | null;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  currentPrice?: number | string | null;
  originalPrice?: number | string | null;
  discountPercent?: number | string | null;
  marketplaceMetrics?: Readonly<Record<string, unknown>> | null;
  intentId?: string | null;
  intent?: string | null;
  productRole?: ProductRoleV2 | null;
  classification?: Partial<CandidateClassificationV2> | null;
  prePersistMonetized?: boolean;
  affiliateUrl?: string | null;
  url?: string | null;
  link?: string | null;
  rawPayload?: Readonly<Record<string, unknown>> | null;
}
