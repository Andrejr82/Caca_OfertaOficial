export const DAILY_TREND_RADAR_STRATEGY_VERSION = "daily-commercial-radar-v1";

export const RADAR_EVIDENCE_STATUSES = ["verified", "partial", "unverified", "rejected"] as const;
export type RadarEvidenceStatus = (typeof RADAR_EVIDENCE_STATUSES)[number];
export type RadarPotential = "high" | "medium" | "low" | "unassessed";
export type RadarMatchStatus = "pending" | "matched" | "no_match";

export interface RadarDirectEvidence {
  claim: string;
  evidence_type: string | null;
  source_url: string | null;
  observed_at: string | null;
  rank_position: number | null;
  best_seller_flag: boolean | null;
  trending_flag: boolean | null;
  sold_quantity: number | null;
  price: number | null;
  old_price: number | null;
  discount_percent: number | null;
  rating: number | null;
  review_count: number | null;
  shipping: string | null;
  marketplace_identity: Record<string, string | null>;
}

export interface DailyTrendRadarInput {
  radar_date?: unknown;
  product_term?: unknown;
  normalized_product_term?: unknown;
  category?: unknown;
  marketplaces?: unknown;
  marketplace?: unknown;
  source_types?: unknown;
  source_urls?: unknown;
  observed_at?: unknown;
  rank_position?: unknown;
  best_seller_flag?: unknown;
  trending_flag?: unknown;
  campaign_flag?: unknown;
  sold_quantity_observed?: unknown;
  observed_price_min?: unknown;
  observed_price_max?: unknown;
  discount_percent?: unknown;
  rating?: unknown;
  shipping_signal?: unknown;
  direct_evidence?: unknown;
  inferred_signals?: unknown;
  source_count?: unknown;
  evidence_status?: unknown;
  confidence?: unknown;
  affiliate_potential?: unknown;
  visual_content_potential?: unknown;
  demand_reason?: unknown;
  rank?: unknown;
  strategy_version?: unknown;
  match_status?: unknown;
  opportunity_id?: unknown;
}

export interface DailyTrendRadarResult {
  radar_date: string;
  product_term: string;
  normalized_product_term: string;
  category: string | null;
  marketplaces: string[];
  source_types: string[];
  source_urls: string[];
  observed_at: string | null;
  rank_position: number | null;
  best_seller_flag: boolean | null;
  trending_flag: boolean | null;
  campaign_flag: boolean | null;
  sold_quantity_observed: number | null;
  observed_price_min: number | null;
  observed_price_max: number | null;
  discount_percent: number | null;
  rating: number | null;
  shipping_signal: string | null;
  direct_evidence: RadarDirectEvidence[];
  inferred_signals: string[];
  source_count: number;
  evidence_status: RadarEvidenceStatus;
  confidence: number;
  affiliate_potential: RadarPotential;
  visual_content_potential: RadarPotential;
  demand_reason: string;
  rank: number | null;
  strategy_version: string;
  match_status: RadarMatchStatus;
  opportunity_id: string | null;
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function boundedNumberOrNull(value: unknown, min: number, max = Number.POSITIVE_INFINITY): number | null {
  const result = numberOrNull(value);
  return result !== null && result >= min && result <= max ? result : null;
}

function integerOrNull(value: unknown, min = 0): number | null {
  const result = numberOrNull(value);
  return result !== null && Number.isInteger(result) && result >= min ? result : null;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function listOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter((item): item is string => Boolean(item)) : [];
}

function validUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
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

function normalizeMarketplaceIdentity(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, raw]) => {
    if (raw === null) return [[key, null]];
    const normalized = text(raw);
    return normalized ? [[key, normalized]] : [];
  }));
}

function emptyDirectEvidence(claim: string): RadarDirectEvidence {
  return {
    claim,
    evidence_type: null,
    source_url: null,
    observed_at: null,
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
    marketplace_identity: {}
  };
}

function normalizeDirectEvidence(value: unknown): RadarDirectEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const claim = entry.trim();
      return claim ? [emptyDirectEvidence(claim)] : [];
    }
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const claim = text(item.claim) || text(item.text) || text(item.fact);
    if (!claim) return [];
    return [{
      claim,
      evidence_type: text(item.evidence_type ?? item.evidenceType),
      source_url: validUrl(item.source_url ?? item.sourceUrl ?? item.url),
      observed_at: validDate(item.observed_at ?? item.observedAt),
      rank_position: integerOrNull(item.rank_position ?? item.rankPosition, 1),
      best_seller_flag: boolOrNull(item.best_seller_flag ?? item.bestSellerFlag),
      trending_flag: boolOrNull(item.trending_flag ?? item.trendingFlag),
      sold_quantity: integerOrNull(item.sold_quantity ?? item.soldQuantity, 0),
      price: boundedNumberOrNull(item.price, 0),
      old_price: boundedNumberOrNull(item.old_price ?? item.oldPrice, 0),
      discount_percent: boundedNumberOrNull(item.discount_percent ?? item.discountPercent, 0, 100),
      rating: boundedNumberOrNull(item.rating, 0, 5),
      review_count: integerOrNull(item.review_count ?? item.reviewCount, 0),
      shipping: text(item.shipping),
      marketplace_identity: normalizeMarketplaceIdentity(item.marketplace_identity ?? item.marketplaceIdentity)
    }];
  });
}

function directEvidenceHasInvalidProvenance(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const item = entry as Record<string, unknown>;
    const rawUrl = item.source_url ?? item.sourceUrl ?? item.url;
    const rawObservedAt = item.observed_at ?? item.observedAt;
    return (Boolean(text(rawUrl)) && !validUrl(rawUrl)) || (Boolean(text(rawObservedAt)) && !validDate(rawObservedAt));
  });
}

function isBaselineOnly(evidence: RadarDirectEvidence[]): boolean {
  return evidence.length > 0 && evidence.every((item) => /market\s+baseline/i.test(item.claim));
}

function deriveEvidenceStatus(input: {
  productTerm: string;
  sourceUrls: string[];
  observedAt: string | null;
  directEvidence: RadarDirectEvidence[];
  invalidProvenanceProvided: boolean;
  hasCommercialEvidence: boolean;
}): RadarEvidenceStatus {
  if (input.invalidProvenanceProvided || !input.productTerm || !input.observedAt) return "rejected";
  if (input.sourceUrls.length === 0 || input.directEvidence.length === 0 || isBaselineOnly(input.directEvidence)) return "unverified";
  if (input.hasCommercialEvidence) return "verified";
  return "partial";
}

function potential(status: RadarEvidenceStatus, hasMarketplace: boolean): RadarPotential {
  if (status === "verified" && hasMarketplace) return "high";
  if (status === "partial") return "medium";
  if (status === "unverified") return "unassessed";
  return "low";
}

function singleNumber(values: Array<number | null>): number | null {
  const observed = [...new Set(values.filter((value): value is number => value !== null))];
  return observed.length === 1 ? observed[0] : null;
}

function singleBoolean(values: Array<boolean | null>): boolean | null {
  const observed = [...new Set(values.filter((value): value is boolean => value !== null))];
  return observed.length === 1 ? observed[0] : null;
}

function singleText(values: Array<string | null>): string | null {
  const observed = [...new Set(values.filter((value): value is string => Boolean(value)))];
  return observed.length === 1 ? observed[0] : null;
}

function observedPriceRange(evidence: RadarDirectEvidence[]): { min: number | null; max: number | null } {
  const prices = evidence.map((item) => item.price).filter((value): value is number => value !== null);
  return prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : { min: null, max: null };
}

export function normalizeRadarInput(input: DailyTrendRadarInput, options: { external?: boolean } = {}): DailyTrendRadarResult {
  const productTerm = text(input.product_term) || "";
  const normalizedProductTerm = text(input.normalized_product_term) || productTerm.toLocaleLowerCase("pt-BR");
  const rawUrls = Array.isArray(input.source_urls) ? input.source_urls : [];
  const topLevelSourceUrls = rawUrls.map(validUrl).filter((url): url is string => Boolean(url));
  const topLevelObservedAt = validDate(input.observed_at);
  const rawDirectEvidence = input.direct_evidence;
  const normalizedDirectEvidence = normalizeDirectEvidence(rawDirectEvidence);
  const directEvidence = normalizedDirectEvidence.map((item) => ({
    ...item,
    source_url: item.source_url ?? (topLevelSourceUrls.length === 1 ? topLevelSourceUrls[0] : null),
    observed_at: item.observed_at ?? topLevelObservedAt
  }));
  const sourceUrls = [...new Set([...topLevelSourceUrls, ...directEvidence.map((item) => item.source_url).filter((url): url is string => Boolean(url))])];
  const invalidTopLevelUrl = rawUrls.some((url) => Boolean(text(url)) && !validUrl(url));
  const invalidTopLevelObservedAt = Boolean(text(input.observed_at)) && !topLevelObservedAt;
  const invalidProvenanceProvided = invalidTopLevelUrl || invalidTopLevelObservedAt || directEvidenceHasInvalidProvenance(rawDirectEvidence);
  const observedAt = topLevelObservedAt ?? singleText(directEvidence.map((item) => item.observed_at));
  const externallyProvided = options.external === true;
  const structuredRank = singleNumber(directEvidence.map((item) => item.rank_position));
  const structuredBestSeller = singleBoolean(directEvidence.map((item) => item.best_seller_flag));
  const structuredTrending = singleBoolean(directEvidence.map((item) => item.trending_flag));
  const structuredSoldQuantity = singleNumber(directEvidence.map((item) => item.sold_quantity));
  const structuredPrices = observedPriceRange(directEvidence);
  const structuredDiscount = singleNumber(directEvidence.map((item) => item.discount_percent));
  const structuredRating = singleNumber(directEvidence.map((item) => item.rating));
  const structuredShipping = singleText(directEvidence.map((item) => item.shipping));
  const rankPosition = externallyProvided ? structuredRank : numberOrNull(input.rank_position);
  const bestSellerFlag = externallyProvided ? structuredBestSeller : boolOrNull(input.best_seller_flag);
  const priceMin = externallyProvided ? structuredPrices.min : numberOrNull(input.observed_price_min);
  const priceMax = externallyProvided ? structuredPrices.max : numberOrNull(input.observed_price_max);
  const discount = externallyProvided ? structuredDiscount : numberOrNull(input.discount_percent);
  const rating = externallyProvided ? structuredRating : numberOrNull(input.rating);
  const soldQuantity = externallyProvided ? structuredSoldQuantity : numberOrNull(input.sold_quantity_observed);
  const shipping = externallyProvided ? structuredShipping : text(input.shipping_signal);
  const trending = externallyProvided ? structuredTrending : boolOrNull(input.trending_flag);
  const hasCommercialEvidence = rankPosition !== null || bestSellerFlag === true || priceMin !== null || priceMax !== null || discount !== null || rating !== null || soldQuantity !== null || Boolean(shipping) || trending === true;
  const evidenceStatus = deriveEvidenceStatus({ productTerm, sourceUrls, observedAt, directEvidence, invalidProvenanceProvided, hasCommercialEvidence });
  const marketplaces = listOfStrings(input.marketplaces ?? (text(input.marketplace) ? [input.marketplace] : []));
  const sourceTypes = listOfStrings(input.source_types);
  const demandReason = evidenceStatus === "unverified"
    ? "Sem fonte atual verificável."
    : directEvidence.map((item) => item.claim).join("; ") || "Evidência comercial parcial.";

  return {
    radar_date: text(input.radar_date) || new Date().toISOString().slice(0, 10),
    product_term: productTerm,
    normalized_product_term: normalizedProductTerm,
    category: text(input.category),
    marketplaces,
    source_types: sourceTypes,
    source_urls: sourceUrls,
    observed_at: observedAt,
    rank_position: rankPosition,
    best_seller_flag: bestSellerFlag,
    trending_flag: trending,
    campaign_flag: externallyProvided ? null : boolOrNull(input.campaign_flag),
    sold_quantity_observed: soldQuantity,
    observed_price_min: priceMin,
    observed_price_max: priceMax,
    discount_percent: discount !== null && discount >= 0 && discount <= 100 ? discount : null,
    rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
    shipping_signal: shipping,
    direct_evidence: directEvidence,
    inferred_signals: listOfStrings(input.inferred_signals),
    source_count: sourceUrls.length,
    evidence_status: priceMax !== null && priceMin !== null && priceMax < priceMin ? "rejected" : evidenceStatus,
    confidence: evidenceStatus === "verified" ? 100 : evidenceStatus === "partial" ? 60 : 0,
    affiliate_potential: potential(evidenceStatus, marketplaces.length > 0),
    visual_content_potential: evidenceStatus === "verified" ? "medium" : evidenceStatus === "partial" ? "low" : "unassessed",
    demand_reason: demandReason,
    rank: null,
    strategy_version: DAILY_TREND_RADAR_STRATEGY_VERSION,
    match_status: "pending",
    opportunity_id: null
  };
}

export function importExternalRadarJson(payload: unknown): DailyTrendRadarResult[] {
  const entries = Array.isArray(payload) ? payload : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results) ? (payload as { results: unknown[] }).results : [];
  return entries.map((entry) => normalizeRadarInput(entry && typeof entry === "object" ? entry as DailyTrendRadarInput : {}, { external: true }));
}

export interface RadarRankingBreakdown {
  evidenceQuality: number;
  sourceDiversity: number;
  explicitRanking: number;
  commercialIntent: number;
  observedPrice: number;
  reliableDiscount: number;
  utilitySignal: number;
  conversionPotential: number;
  visualPotential: number;
  marketplaceAvailability: number;
  total: number;
}

export function calculateRadarRankingBreakdown(result: DailyTrendRadarResult): RadarRankingBreakdown {
  if (result.evidence_status === "rejected" || result.evidence_status === "unverified") return { evidenceQuality: 0, sourceDiversity: 0, explicitRanking: 0, commercialIntent: 0, observedPrice: 0, reliableDiscount: 0, utilitySignal: 0, conversionPotential: 0, visualPotential: 0, marketplaceAvailability: 0, total: 0 };
  const evidence = result.evidence_status === "verified" ? 60 : 35;
  const sourceDiversity = Math.min(result.source_count, 3) * 8;
  const explicitRank = result.rank_position !== null ? 12 : 0;
  const bestSeller = result.best_seller_flag === true ? 8 : 0;
  const price = result.observed_price_min !== null ? 5 : 0;
  const discount = result.discount_percent !== null ? 4 : 0;
  const inference = result.inferred_signals.join(" ");
  const utilitySignal = /util|útil|prátic|soluç/i.test(inference) ? 4 : 0;
  const conversionPotential = result.affiliate_potential === "high" ? 4 : result.affiliate_potential === "medium" ? 2 : 0;
  const visualPotential = result.visual_content_potential === "high" ? 4 : result.visual_content_potential === "medium" ? 2 : 0;
  const marketplace = result.marketplaces.length > 0 ? 3 : 0;
  const commercialIntent = bestSeller;
  const total = evidence + sourceDiversity + explicitRank + commercialIntent + price + discount + utilitySignal + conversionPotential + visualPotential + marketplace;
  return { evidenceQuality: evidence, sourceDiversity, explicitRanking: explicitRank, commercialIntent, observedPrice: price, reliableDiscount: discount, utilitySignal, conversionPotential, visualPotential, marketplaceAvailability: marketplace, total };
}

export function rankDailyTrendRadar(results: DailyTrendRadarResult[]): DailyTrendRadarResult[] {
  return [...results]
    .map((result, index) => ({ result, score: calculateRadarRankingBreakdown(result).total, index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ result }, index) => ({ ...result, rank: result.evidence_status === "verified" || result.evidence_status === "partial" ? index + 1 : null }));
}

export function buildDailyRadarFromTrendSignals(
  signals: TrendSignalListItem[],
  opportunities: TrendOpportunityListItem[]
): DailyTrendRadarResult[] {
  const opportunityBySignal = new Map(opportunities.map((opportunity) => [opportunity.signalId, opportunity]));
  return signals.map((signal) => {
    const opportunity = opportunityBySignal.get(signal.id);
    const evidence = signal.evidence ?? {};
    const sourceUrls = [validUrl(evidence.link), validUrl(evidence.exploreLink)].filter((url): url is string => Boolean(url));
    const persistedSourceUrls = Array.isArray(evidence.source_urls)
      ? evidence.source_urls.map(validUrl).filter((url): url is string => Boolean(url))
      : [];
    const persistedEvidence = Array.isArray(evidence.direct_evidence) ? evidence.direct_evidence : [];
    const classification = signal.classification;
    const normalized = normalizeRadarInput({
      radar_date: signal.observedAt.slice(0, 10),
      product_term: signal.term,
      normalized_product_term: classification?.normalizedProductTerm || signal.term,
      category: classification?.categoryHint,
      marketplaces: opportunity?.marketplace ? [opportunity.marketplace] : [],
      source_types: [signal.sourceName],
      source_urls: [...new Set([...sourceUrls, ...persistedSourceUrls])],
      observed_at: signal.observedAt,
      direct_evidence: persistedEvidence.length > 0
        ? persistedEvidence
        : sourceUrls.map((sourceUrl) => ({ claim: `Sinal observado em ${signal.sourceName}.`, source_url: sourceUrl, observed_at: signal.observedAt })),
      inferred_signals: [],
      trending_flag: signal.source === "google_trends" ? true : null,
      match_status: opportunity?.matchStatus || "pending",
      opportunity_id: opportunity?.id || null
    }, { external: true });
    const result = {
      ...normalized,
      marketplaces: opportunity?.marketplace ? [opportunity.marketplace] : normalized.marketplaces,
      match_status: opportunity?.matchStatus || "pending",
      opportunity_id: opportunity?.id || null
    };
    if (classification?.decision === "rejected") return { ...result, evidence_status: "rejected", confidence: 0, affiliate_potential: "low", visual_content_potential: "unassessed" };
    if (!classification) return { ...result, evidence_status: "unverified", confidence: 0, affiliate_potential: "unassessed", visual_content_potential: "unassessed" };
    return result;
  });
}
import type { TrendOpportunityListItem, TrendSignalListItem } from "@/core/trends/types";
