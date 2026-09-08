declare module "*/scripts/offer-freshness-gate.cjs" {
  export interface FreshnessStateResult {
    state: "new" | "known_unpublished" | "published_cooldown" | "material_change";
    eligible: boolean;
    reason: string;
    details?: {
      hoursSincePublication?: number | null;
      priceChangePercent?: number | null;
      discountChangePercent?: number | null;
    };
  }

  export function evaluateCandidateFreshness(
    marketplace: string,
    candidate: any,
    persistedHistory?: any,
    options?: { cooldownDays?: number; now?: string | number }
  ): FreshnessStateResult;

  export function isMateriallyBetter(product: any, previous: any): boolean;
  export function hasPublicationEvidence(row?: any): boolean;

  export function filterFreshCandidates(
    candidates: any[],
    persistedHistory?: any,
    options?: any
  ): {
    eligible: any[];
    ineligible: any[];
    reasons: Record<string, number>;
  };
}

declare module "*/scripts/product-title-quality.cjs" {
  export interface ProductTitleQualityResult {
    valid: boolean;
    reason: string | null;
    normalized?: string;
  }

  export function isAccessoryOnlyProductTitle(title: string | null | undefined): boolean;
  export function validateProductTitle(title: string | null | undefined): ProductTitleQualityResult;
}

declare module "*/scripts/classification-coverage.cjs" {
  export interface ClassificationResult {
    status: "classified" | "review_required" | "excluded";
    productType: string | null;
    productRole?: string;
    confidence?: number;
    evidence?: Record<string, any>;
    source?: string;
  }

  export function classifyCandidate(candidate: any, marketplace?: string): ClassificationResult;
  export function buildClassificationCoverage(candidates: any[]): Record<string, any>;
}
