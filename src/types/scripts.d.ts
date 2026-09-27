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

declare module "*shopee-engine.cjs" {
  export const GRAPHQL_CONTRACTS: Record<string, any>;
  export const PRODUCT_OFFER_QUERY: string;
  export const SCENARIOS: Record<string, any>;
  export const SCENARIO_WINDOWS: Record<string, any>;
  export function createSignedHeaders(input: any): Record<string, string>;
  export function createSignedRequest(input: any): (operation: string, query: string, variables: Record<string, any>) => Promise<{ status: number; data: any }>;
  export function normalizePriceIntegrity(product: any): any;
  export function normalizeShopeeProduct(product: any, options?: any): any;
  export function normalizeProductOffer(product: any, options?: any): any;
  export function isEligibleShopeeCandidate(product: any, scenarioAllowedTerms?: string[]): boolean;
  export function searchShopeeOffers(options?: any): Promise<any>;
  export function discoverShopeeScenarioOffers(scenarioId: string, options?: any): Promise<any>;
  export function runShopeeOpenApiV1OfficialForScenario(scenarioId: string, options?: any): Promise<any>;
  export function getControlledPersistDecision(scenarioResult?: any): any;
  export function buildControlledPersistIngestions(products: any[], scenarioId: string, options?: any): any[];
  export function buildShopeePeerScoringPool(candidates: any[]): any[];
  export function buildShopeeIngestions(products: any[], scenarioId: string, options?: any): any[];
  export function buildProductOfferPayload(keyword: string, productCatId?: number, page?: number, limit?: number, sortType?: number): any;
  export function sanitizeProduct(node: any, options?: any): any;
  export function calculateObjectiveScore(product: any): number;
}

declare module "*mercadolivre-engine.cjs" {
  export const API_ROOT: string;
  export const DEFAULT_MAX_PER_INTENT: number;
  export const ML_OPPORTUNITY_STRATEGY_VERSION: string;
  export const ML_RADAR_DISCOVERY_INTENTS: readonly string[];
  export const ML_RADAR_INTENT_MACRO_GROUPS: Record<string, string>;
  export const SEARCH_ALIASES: Record<string, readonly string[]>;
  export function refreshAccessToken(options?: any): Promise<string>;
  export function apiGet(endpoint: string, options?: any): Promise<any>;
  export function normalizeMercadoLivreProduct(raw: any, sourceCategory?: any): any;
  export function normalizeMercadoLivreDiscoveryProduct(product: any): any;
  export function collectMercadoLivreRadarDiscoveryV1(options?: any): Promise<any[]>;
  export function isEligibleMercadoLivreCandidate(product: any, scenarioAllowedTerms?: string[]): boolean;
  export function searchMercadoLivreOffers(options?: any): Promise<any>;
  export function discoverMercadoLivreScenarioOffers(scenarioId: string, options?: any): Promise<any>;
  export function runMercadoLivreOfficialIntentCoverage(options?: any): Promise<any>;
  export function buildMercadoLivreIngestions(products: any[], scenarioId: string, options?: any): any[];
}

declare module "*amazon-engine.cjs" {
  export const BEST_SELLERS_ROOT: string;
  export const AMAZON_SEARCH_ROOT: string;
  export const SCENARIOS: Record<string, any>;
  export const AMAZON_ALIASES: Record<string, readonly string[]>;
  export function fetchAmazonHtml(url: string, options?: any): Promise<string>;
  export function parseAmazonSearchHtml(html: string, options?: any): any[];
  export function isEligibleAmazonCandidate(product: any, scenarioAllowedTerms?: string[]): boolean;
  export function searchAmazonOffers(options?: any): Promise<any>;
  export function discoverAmazonScenarioOffers(scenarioId: string, options?: any): Promise<any>;
  export function runAmazonNativeTop20(options?: any): Promise<any>;
  export function runAmazonScenarioDryRun(options?: any): Promise<any>;
  export function buildAmazonIngestions(products: any[], scenarioId: string, options?: any): any[];
  export function buildAmazonDiagnostic(options?: any): any;
  export function evaluateAmazonProductDiagnostics(product: any, scenario: any, finalQueuePosition: number): any;
}

