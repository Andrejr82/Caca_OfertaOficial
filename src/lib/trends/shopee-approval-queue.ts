import type { TrendOfferCandidate } from "@/core/trends/offer-matching";
import { searchShopeeOfficialV1 } from "@/lib/trends/shopee-search-adapter";

export const TREND_SHOPEE_MAX_INTENTS = 5;
export const TREND_SHOPEE_MAX_PER_INTENT = 3;

export interface TrendRadarApprovalProduct {
  id: string;
  priority: number;
  product_term: string;
  category: string | null;
  evidence_status: string;
  commercial_score: number | null;
  confidence: number | null;
}

export interface TrendShopeeApprovalCandidate {
  radarProductId: string;
  productTerm: string;
  category: string | null;
  priority: number;
  itemId: string;
  shopId: string;
  productName: string;
  imageUrl: string;
  affiliateUrl: string;
  currentPrice: number;
  score: number;
  rating: number | null;
  sales: number | null;
  discount: number | null;
  commission: number | null;
  marketplaceMetrics: Record<string, unknown>;
}

export interface TrendShopeeApprovalDiscoveryResult {
  searchedIntents: number;
  rejectedRadarProducts: Array<{ radarProductId: string; productTerm: string; reason: string }>;
  candidates: TrendShopeeApprovalCandidate[];
}

interface ApprovalPersistenceClient {
  rpc(functionName: string, args: Record<string, unknown>): PromiseLike<{ data: any; error: { message: string } | null }>;
  from(table: string): any;
}

const COMMERCIAL_SAFETY_RULES = Object.freeze([
  { reason: "regulated_weapon", pattern: /\b(?:airsoft|arma|armas|municao|munição|taser|spray de pimenta)\b/i },
  { reason: "regulated_nicotine", pattern: /\b(?:vape|cigarro eletronico|cigarro eletrônico|nicotina|pod descartavel|pod descartável)\b/i },
  { reason: "regulated_medication", pattern: /\b(?:masteron|injetavel|injetável|minoxidil|tesamorelin|peptideos? de cobre|peptídeos? de cobre|ghk[ -]?cu)\b/i },
  { reason: "adult_product", pattern: /\b(?:vibrador|dildo|masturbador|sex shop)\b/i },
]);

const GENERIC_RELEVANCE_TOKENS = new Set([
  "produto", "oferta", "novo", "nova", "original", "kit", "celular", "smartphone",
]);

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function words(value: unknown) {
  return normalize(value).split(/\s+/).filter(Boolean);
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value: unknown): number | null {
  const parsed = number(value);
  if (parsed == null) return null;
  return parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
}

function textMetric(candidate: TrendOfferCandidate, key: string): string | null {
  const value = candidate.marketplaceMetrics?.[key];
  const result = String(value ?? "").trim();
  return result || null;
}

function numberMetric(candidate: TrendOfferCandidate, key: string): number | null {
  return number(candidate.marketplaceMetrics?.[key]);
}

function safetyReason(product: TrendRadarApprovalProduct): string | null {
  const value = `${product.product_term} ${product.category ?? ""}`;
  return COMMERCIAL_SAFETY_RULES.find((rule) => rule.pattern.test(value))?.reason ?? null;
}

function relevanceTokens(productTerm: string) {
  const tokens = words(productTerm).filter((token) => token.length >= 3);
  const distinctive = tokens.filter((token) => !GENERIC_RELEVANCE_TOKENS.has(token));
  return distinctive.length > 0 ? distinctive : tokens;
}

function candidateRelevance(candidate: TrendOfferCandidate, productTerm: string): boolean {
  const expected = relevanceTokens(productTerm);
  if (expected.length === 0) return false;
  const titleTokens = new Set(words(candidate.productName));
  return expected.every((token) => titleTokens.has(token));
}

function candidateTechnicalReason(candidate: TrendOfferCandidate, productTerm: string): string | null {
  if (candidate.marketplace !== "Shopee") return "marketplace_invalid";
  const itemId = String(candidate.shopeeItemId || candidate.itemId || "");
  const shopId = textMetric(candidate, "shopId") || "";
  if (!/^\d+$/.test(itemId) || !/^\d+$/.test(shopId)) return "native_identity_invalid";
  const price = number(candidate.currentPrice);
  if (price == null || price <= 0) return "price_invalid";
  const imageUrl = textMetric(candidate, "imageUrl") || "";
  if (!/^https:\/\//i.test(imageUrl)) return "image_invalid";
  const affiliateUrl = textMetric(candidate, "affiliateUrl") || "";
  if (!/^https:\/\//i.test(affiliateUrl) || !/(?:s\.shopee\.com\.br|shope\.ee|affiliates|ext_camp)/i.test(affiliateUrl)) return "affiliate_url_invalid";
  if (!candidateRelevance(candidate, productTerm)) return "term_mismatch";
  return null;
}

function candidateScore(radar: TrendRadarApprovalProduct, candidate: TrendOfferCandidate): number {
  const rating = numberMetric(candidate, "rating") ?? 0;
  const sales = numberMetric(candidate, "sales") ?? 0;
  const discount = percent(candidate.marketplaceMetrics?.discount) ?? 0;
  const commission = Math.max(
    percent(candidate.marketplaceMetrics?.commissionRate) ?? 0,
    percent(candidate.marketplaceMetrics?.shopeeCommissionRate) ?? 0,
    percent(candidate.marketplaceMetrics?.sellerCommissionRate) ?? 0,
  );
  const radarScore = Math.max(0, Math.min(100, Number(radar.commercial_score ?? 0))) * 0.3;
  const ratingScore = Math.max(0, Math.min(20, (rating / 5) * 20));
  const salesScore = Math.max(0, Math.min(20, Math.log10(Math.max(1, sales)) * 5));
  const discountScore = Math.max(0, Math.min(15, discount / 2));
  const commissionScore = Math.max(0, Math.min(15, commission));
  return Number((radarScore + ratingScore + salesScore + discountScore + commissionScore).toFixed(2));
}

function normalizeOfferScore(score: number): number {
  return Number((Math.max(0, Math.min(100, Number(score) || 0)) / 10).toFixed(2));
}

export function rankTrendShopeeCandidates(
  radar: TrendRadarApprovalProduct,
  candidates: TrendOfferCandidate[],
  maxPerIntent = TREND_SHOPEE_MAX_PER_INTENT,
): TrendShopeeApprovalCandidate[] {
  const ranked = candidates.flatMap((candidate) => {
    if (candidateTechnicalReason(candidate, radar.product_term)) return [];
    const itemId = String(candidate.shopeeItemId || candidate.itemId);
    const shopId = String(textMetric(candidate, "shopId"));
    const imageUrl = String(textMetric(candidate, "imageUrl"));
    const affiliateUrl = String(textMetric(candidate, "affiliateUrl"));
    const rating = numberMetric(candidate, "rating");
    const sales = numberMetric(candidate, "sales");
    const discount = percent(candidate.marketplaceMetrics?.discount);
    const commission = Math.max(
      percent(candidate.marketplaceMetrics?.commissionRate) ?? 0,
      percent(candidate.marketplaceMetrics?.shopeeCommissionRate) ?? 0,
      percent(candidate.marketplaceMetrics?.sellerCommissionRate) ?? 0,
    ) || null;
    return [{
      radarProductId: radar.id,
      productTerm: radar.product_term,
      category: radar.category,
      priority: Number(radar.priority || 999),
      itemId,
      shopId,
      productName: candidate.productName,
      imageUrl,
      affiliateUrl,
      currentPrice: Number(candidate.currentPrice),
      score: candidateScore(radar, candidate),
      rating,
      sales,
      discount,
      commission,
      marketplaceMetrics: candidate.marketplaceMetrics ?? {},
    }];
  });

  const seenItems = new Set<string>();
  return ranked
    .sort((a, b) => b.score - a.score || (b.sales ?? 0) - (a.sales ?? 0) || a.itemId.localeCompare(b.itemId))
    .filter((candidate) => {
      if (seenItems.has(candidate.itemId)) return false;
      seenItems.add(candidate.itemId);
      return true;
    })
    .slice(0, Math.max(1, maxPerIntent));
}

export async function discoverTrendShopeeApprovalCandidates(
  radarProducts: TrendRadarApprovalProduct[],
  options: {
    search?: (query: string) => Promise<TrendOfferCandidate[]>;
    maxIntents?: number;
    maxPerIntent?: number;
  } = {},
): Promise<TrendShopeeApprovalDiscoveryResult> {
  const search = options.search ?? searchShopeeOfficialV1;
  const maxIntents = Math.max(1, Math.min(Number(options.maxIntents ?? TREND_SHOPEE_MAX_INTENTS), TREND_SHOPEE_MAX_INTENTS));
  const maxPerIntent = Math.max(1, Math.min(Number(options.maxPerIntent ?? TREND_SHOPEE_MAX_PER_INTENT), TREND_SHOPEE_MAX_PER_INTENT));
  const rejectedRadarProducts: TrendShopeeApprovalDiscoveryResult["rejectedRadarProducts"] = [];
  const eligible = [...radarProducts]
    .sort((a, b) => Number(a.priority || 999) - Number(b.priority || 999))
    .filter((product) => {
      if (!["verified", "partial"].includes(String(product.evidence_status || "").toLowerCase())) {
        rejectedRadarProducts.push({ radarProductId: product.id, productTerm: product.product_term, reason: "evidence_ineligible" });
        return false;
      }
      const blocked = safetyReason(product);
      if (blocked) {
        rejectedRadarProducts.push({ radarProductId: product.id, productTerm: product.product_term, reason: blocked });
        return false;
      }
      return Boolean(String(product.product_term || "").trim());
    })
    .slice(0, maxIntents);

  const candidates: TrendShopeeApprovalCandidate[] = [];
  const seenItems = new Set<string>();
  for (const radar of eligible) {
    const found = await search(radar.product_term);
    for (const candidate of rankTrendShopeeCandidates(radar, found, maxPerIntent)) {
      if (seenItems.has(candidate.itemId)) continue;
      seenItems.add(candidate.itemId);
      candidates.push(candidate);
    }
  }
  candidates.sort((a, b) => a.priority - b.priority || b.score - a.score || a.itemId.localeCompare(b.itemId));
  return { searchedIntents: eligible.length, rejectedRadarProducts, candidates };
}

export function buildTrendShopeeApprovalRows(userId: string, radarRunId: string, candidates: TrendShopeeApprovalCandidate[]) {
  const correlationId = `trend-executive:${radarRunId}`;
  return candidates.map((candidate, index) => ({
    user_id: userId,
    platform: "Shopee",
    product_name: candidate.productName,
    category: candidate.category,
    original_url: candidate.affiliateUrl,
    image_url: candidate.imageUrl,
    current_price: candidate.currentPrice,
    old_price: null,
    score: normalizeOfferScore(candidate.score),
    status: "pending_manual_review",
    explainability: {
      contract_version: "trend-executive.approval-queue/v1",
      correlation_id: correlationId,
      provenance: "trend_executive",
      radar_run_id: radarRunId,
      radar_product_id: candidate.radarProductId,
      product_term: candidate.productTerm,
      ranking_score: candidate.score,
      persisted_score_scale: "0-10",
      ranking_position: index + 1,
      automatic_publication: false,
      technical_validation: "passed",
      marketplace_metrics: candidate.marketplaceMetrics,
    },
    notes: `Trends IA: ${candidate.productTerm} · pronto para aprovação manual.`,
    shopee_item_id: candidate.itemId,
    shopee_shop_id: candidate.shopId,
    shopee_product_cat_id: null,
    native_category_order: null,
    native_category_position: index + 1,
  }));
}

export async function persistTrendShopeeApprovalCandidates(
  client: ApprovalPersistenceClient,
  userId: string,
  radarRunId: string,
  candidates: TrendShopeeApprovalCandidate[],
) {
  if (candidates.length === 0) return { inserted: 0, updated: 0, failed: 0, offerIds: [] as string[], readyOfferIds: [] as string[] };
  const rows = buildTrendShopeeApprovalRows(userId, radarRunId, candidates);
  const { data, error } = await client.rpc("upsert_discovery_offers_v2", { p_marketplace: "Shopee", p_rows: rows });
  if (error) throw new Error(`Falha ao materializar fila Trends: ${error.message}`);
  const offerIds = Array.isArray(data?.offer_ids) ? data.offer_ids.map(String) : [];
  const { data: readyRows, error: readyError } = offerIds.length > 0
    ? await client.from("offers").select("id,status").in("id", offerIds)
    : { data: [], error: null };
  if (readyError) throw new Error(`Falha ao confirmar fila Trends: ${readyError.message}`);
  const readyOfferIds = (readyRows || []).filter((offer: { id: string; status: string }) => offer.status === "pending_manual_review").map((offer: { id: string }) => offer.id);
  return {
    inserted: Number(data?.inserted || 0),
    updated: Number(data?.updated || 0),
    failed: Number(data?.failed || 0),
    offerIds,
    readyOfferIds,
  };
}