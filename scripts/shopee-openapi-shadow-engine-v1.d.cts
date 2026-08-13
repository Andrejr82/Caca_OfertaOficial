export interface ShopeeEngine {
  createSignedRequest: (params: {
    appId: string;
    appSecret: string;
    request: (args: { body: string; headers: Record<string, string> }) => Promise<{ status: number; data: unknown }>;
  }) => (operationName: string, query: string, variables: Record<string, unknown>) => Promise<{ status: number; data: any }>;
}

export declare const GRAPHQL_CONTRACTS: { productOfferV2: { query: string } } & Record<string, { query: string }>;
export declare const SCENARIO_CONTRACTS: unknown;
export declare const SCENARIO_QUERY_PLANS: unknown;
export declare function normalizeCommission(v: unknown): unknown;
export declare function normalizePriceIntegrity(v: unknown): unknown;
export declare function matchesRequiredProductIdentity(v: unknown): unknown;
export declare function evaluateIntent(v: unknown): unknown;
export declare function normalizeProductOffer(v: unknown, context?: Record<string, unknown>): {
  accepted: boolean;
  product: { itemId: string; price: number; priceMin: number; ratingStar: number; commissionPercent: number; commissionUnresolved?: boolean };
};
export declare function normalizeFeedColumns(v: unknown): unknown;
export declare function processDeltaRows(v: unknown): unknown;
export declare function runShadow(v: unknown): unknown;
export declare function runScenarioPlan(v: unknown): unknown;
export declare function resolveAuxiliaryOffers(v: unknown): unknown;
export declare function collectScenarioCoverage(v: unknown): unknown;
export declare function createSignedRequest(v: {
  appId: string;
  appSecret: string;
  request: (args: { body: string; headers: Record<string, string> }) => Promise<{ status: number; data: any }>;
}): (operationName: string, query: string, variables: Record<string, unknown>) => Promise<{ status: number; data: any }>;
export declare function familyKey(v: unknown): unknown;
export declare function scoreProduct(v: unknown): unknown;
export declare function buildFixtureSources(v: unknown): unknown;
export declare function collectLiveSources(v: unknown): unknown;
export declare function runCli(v: unknown): unknown;
