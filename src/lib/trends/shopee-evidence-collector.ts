import type { TrendDirectEvidence, TrendSignal } from "@/core/trends/types";

export type ShopeeEvidenceSource = "shopee_product_offer" | "shopee_campaign";
export type ShopeeEvidenceStatus = "ok" | "empty" | "failed";

interface ShopeeProductOfferNode {
  itemId?: unknown;
  shopId?: unknown;
  shopName?: unknown;
  productName?: unknown;
  productLink?: unknown;
  offerLink?: unknown;
  priceMin?: unknown;
  priceMax?: unknown;
  ratingStar?: unknown;
  sales?: unknown;
  priceDiscountRate?: unknown;
}

interface ShopeeCampaignNode {
  offerName?: unknown;
  offerLink?: unknown;
  imageUrl?: unknown;
  commissionRate?: unknown;
}

interface NormalizeProductOptions {
  query: string;
  observedAt: string;
  capturedAt: string;
}

interface NormalizeCampaignOptions {
  observedAt: string;
  capturedAt: string;
}

export interface ShopeeEvidenceCollectionResult {
  source: ShopeeEvidenceSource;
  status: ShopeeEvidenceStatus;
  received: number;
  accepted: number;
  rejected: number;
  errorCode: string | null;
  signals: TrendSignal[];
}

interface ProductCollectorDependencies {
  now?: () => Date;
  loadNodes?: (query: string) => Promise<ShopeeProductOfferNode[]>;
}

interface CampaignCollectorDependencies {
  now?: () => Date;
  loadNodes?: () => Promise<ShopeeCampaignNode[]>;
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function validUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function validDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : null;
}

function nonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isInteger(result) && result >= 0 ? result : null;
}

function rating(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && result <= 5 ? result : null;
}

function discountPercent(value: unknown): number | null {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) return null;
  const normalized = result > 0 && result <= 1 ? result * 100 : result;
  return normalized <= 100 ? normalized : null;
}

function emptyDirectEvidence(input: {
  claim: string;
  evidenceType: ShopeeEvidenceSource;
  sourceUrl: string;
  observedAt: string;
  marketplaceIdentity: Record<string, string | null>;
}): TrendDirectEvidence {
  return {
    claim: input.claim,
    evidence_type: input.evidenceType,
    source_url: input.sourceUrl,
    observed_at: input.observedAt,
    rank_position: null,
    best_seller_flag: null,
    trending_flag: null,
    sold_quantity: null,
    price: null,
    old_price: null,
    discount_percent: null,
    rating: null,
    review_count: null,
    shipping: null,
    marketplace_identity: input.marketplaceIdentity
  };
}

function failed(source: ShopeeEvidenceSource, errorCode: string): ShopeeEvidenceCollectionResult {
  return { source, status: "failed", received: 0, accepted: 0, rejected: 0, errorCode, signals: [] };
}

function finalize(source: ShopeeEvidenceSource, received: number, signals: TrendSignal[]): ShopeeEvidenceCollectionResult {
  const accepted = signals.length;
  const rejected = Math.max(0, received - accepted);
  return {
    source,
    status: accepted > 0 ? "ok" : "empty",
    received,
    accepted,
    rejected,
    errorCode: null,
    signals
  };
}

export function normalizeShopeeProductOfferEvidence(
  nodes: ShopeeProductOfferNode[],
  options: NormalizeProductOptions
): ShopeeEvidenceCollectionResult {
  const observedAt = validDate(options.observedAt);
  const capturedAt = validDate(options.capturedAt);
  const query = text(options.query);
  if (!observedAt) return failed("shopee_product_offer", "invalid_observed_at");
  if (!capturedAt) return failed("shopee_product_offer", "invalid_captured_at");
  if (!query) return failed("shopee_product_offer", "invalid_query");

  const signals = nodes.flatMap((node): TrendSignal[] => {
    const itemId = text(node.itemId);
    const shopId = text(node.shopId);
    const productName = text(node.productName);
    const sourceUrl = validUrl(node.productLink) ?? validUrl(node.offerLink);
    if (!itemId || !shopId || !productName || !sourceUrl) return [];

    const evidence = emptyDirectEvidence({
      claim: `Produto observado via Shopee Affiliate OpenAPI productOfferV2: ${productName}.`,
      evidenceType: "shopee_product_offer",
      sourceUrl,
      observedAt,
      marketplaceIdentity: { marketplace: "shopee", shop_id: shopId, item_id: itemId }
    });
    evidence.sold_quantity = nonNegativeInteger(node.sales);
    evidence.price = positiveNumber(node.priceMin) ?? positiveNumber(node.priceMax);
    evidence.discount_percent = discountPercent(node.priceDiscountRate);
    evidence.rating = rating(node.ratingStar);

    const externalId = `shopee:${shopId}:${itemId}`;
    return [{
      id: externalId,
      sourceType: "external",
      sourceName: "shopee_product_offer",
      source: "shopee_product_offer",
      region: "BR",
      externalId,
      term: query,
      title: productName,
      evidence: {
        source_urls: [sourceUrl],
        direct_evidence: [evidence],
        marketplace_identity: evidence.marketplace_identity,
        shop_name: text(node.shopName)
      },
      observedAt,
      capturedAt,
      trendStrength: null,
      trendDirection: null,
      offerId: null
    }];
  });

  return finalize("shopee_product_offer", nodes.length, signals);
}

export function normalizeShopeeCampaignEvidence(
  nodes: ShopeeCampaignNode[],
  options: NormalizeCampaignOptions
): ShopeeEvidenceCollectionResult {
  const observedAt = validDate(options.observedAt);
  const capturedAt = validDate(options.capturedAt);
  if (!observedAt) return failed("shopee_campaign", "invalid_observed_at");
  if (!capturedAt) return failed("shopee_campaign", "invalid_captured_at");

  const signals = nodes.flatMap((node): TrendSignal[] => {
    const offerName = text(node.offerName);
    const sourceUrl = validUrl(node.offerLink);
    if (!offerName || !sourceUrl) return [];
    const evidence = emptyDirectEvidence({
      claim: `Campanha observada via Shopee Affiliate OpenAPI shopeeOfferV2: ${offerName}.`,
      evidenceType: "shopee_campaign",
      sourceUrl,
      observedAt,
      marketplaceIdentity: { marketplace: "shopee" }
    });

    return [{
      id: sourceUrl,
      sourceType: "external",
      sourceName: "shopee_campaign",
      source: "shopee_campaign",
      region: "BR",
      externalId: sourceUrl,
      term: offerName,
      title: offerName,
      evidence: {
        source_urls: [sourceUrl],
        direct_evidence: [evidence],
        campaign_flag: true
      },
      observedAt,
      capturedAt,
      trendStrength: null,
      trendDirection: null,
      offerId: null
    }];
  });

  return finalize("shopee_campaign", nodes.length, signals);
}

async function signedShopeeRequest(operationName: string, query: string, variables: Record<string, unknown>) {
  const appId = process.env.SHOPEE_APP_ID;
  const appSecret = process.env.SHOPEE_APP_SECRET;
  if (!appId || !appSecret) throw new Error("Shopee OpenAPI V1 não configurada.");
  const engine = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    createSignedRequest(input: {
      appId: string;
      appSecret: string;
      request: (input: { body: string; headers: Record<string, string> }) => Promise<{ status: number; data: unknown }>;
    }): (operation: string, query: string, variables: Record<string, unknown>) => Promise<{ status: number; data: any }>;
    GRAPHQL_CONTRACTS: {
      productOfferV2: { query: string };
      shopeeOfferV2: { query: string };
    };
  };
  const request = engine.createSignedRequest({
    appId,
    appSecret,
    request: async ({ body, headers }) => {
      const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30_000)
      });
      return { status: response.status, data: await response.json() };
    }
  });
  const response = await request(operationName, query, variables);
  if (response.status !== 200 || response.data?.errors?.length) throw new Error(`Shopee OpenAPI V1 HTTP ${response.status}`);
  return { engine, response };
}

async function loadOfficialProductNodes(query: string): Promise<ShopeeProductOfferNode[]> {
  const engine = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    GRAPHQL_CONTRACTS: { productOfferV2: { query: string } };
  };
  const { response } = await signedShopeeRequest("ShopeePromotionOffers", engine.GRAPHQL_CONTRACTS.productOfferV2.query, {
    keyword: query,
    page: 1,
    limit: 20,
    sortType: 2,
    isAMSOffer: true
  });
  return response.data?.data?.productOfferV2?.nodes ?? [];
}

async function loadOfficialCampaignNodes(): Promise<ShopeeCampaignNode[]> {
  const engine = require("../../../scripts/shopee-openapi-shadow-engine-v1.cjs") as {
    GRAPHQL_CONTRACTS: { shopeeOfferV2: { query: string } };
  };
  const { response } = await signedShopeeRequest("ShopeeOfferV2", engine.GRAPHQL_CONTRACTS.shopeeOfferV2.query, { page: 1, limit: 20 });
  return response.data?.data?.shopeeOfferV2?.nodes ?? [];
}

export async function collectShopeeProductOfferEvidence(
  query: string,
  dependencies: ProductCollectorDependencies = {}
): Promise<ShopeeEvidenceCollectionResult> {
  const observedAt = (dependencies.now?.() ?? new Date()).toISOString();
  try {
    const nodes = await (dependencies.loadNodes ?? loadOfficialProductNodes)(query);
    return normalizeShopeeProductOfferEvidence(nodes, { query, observedAt, capturedAt: observedAt });
  } catch {
    return failed("shopee_product_offer", "source_unavailable");
  }
}

export async function collectShopeeCampaignEvidence(
  dependencies: CampaignCollectorDependencies = {}
): Promise<ShopeeEvidenceCollectionResult> {
  const observedAt = (dependencies.now?.() ?? new Date()).toISOString();
  try {
    const nodes = await (dependencies.loadNodes ?? loadOfficialCampaignNodes)();
    return normalizeShopeeCampaignEvidence(nodes, { observedAt, capturedAt: observedAt });
  } catch {
    return failed("shopee_campaign", "source_unavailable");
  }
}
