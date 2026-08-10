export const DAILY_TREND_RADAR_STRATEGY_VERSION = "daily-commercial-radar-v1";

export const RADAR_EVIDENCE_STATUSES = ["verified", "partial", "unverified", "rejected"] as const;
export type RadarEvidenceStatus = (typeof RADAR_EVIDENCE_STATUSES)[number];
export type RadarPotential = "high" | "medium" | "low" | "unassessed";
export type RadarMatchStatus = "pending" | "matched" | "no_match";

export interface RadarDirectEvidence {
  claim: string;
  source_url?: string | null;
  observed_at?: string | null;
}

export interface DailyTrendRadarInput {
  radar_date?: unknown;
  product_term?: unknown;
  normalized_product_term?: unknown;
  category?: unknown;
  marketplaces?: unknown;
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

function normalizeDirectEvidence(value: unknown): RadarDirectEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === "string") {
      const claim = entry.trim();
      return claim ? [{ claim, source_url: null, observed_at: null }] : [];
    }
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const claim = text(item.claim) || text(item.text);
    if (!claim) return [];
    return [{ claim, source_url: validUrl(item.source_url ?? item.sourceUrl), observed_at: validDate(item.observed_at ?? item.observedAt) }];
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
  invalidUrlProvided: boolean;
  hasCommercialEvidence: boolean;
}): RadarEvidenceStatus {
  if (input.invalidUrlProvided || !input.productTerm || !input.observedAt) return "rejected";
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

function evidenceText(evidence: RadarDirectEvidence[]): string {
  return evidence.map((item) => item.claim).join(" ");
}

function rankFromEvidence(evidence: RadarDirectEvidence[]): number | null {
  const match = evidenceText(evidence).match(/(?:rank|ranking|posi[cç][aã]o)\s*(?:#|n[úu]mero)?\s*(\d{1,4})/i);
  return match ? Number(match[1]) : null;
}

export function normalizeRadarInput(input: DailyTrendRadarInput, options: { external?: boolean } = {}): DailyTrendRadarResult {
  const productTerm = text(input.product_term) || "";
  const normalizedProductTerm = text(input.normalized_product_term) || productTerm.toLocaleLowerCase("pt-BR");
  const rawUrls = Array.isArray(input.source_urls) ? input.source_urls : [];
  const sourceUrls = rawUrls.map(validUrl).filter((url): url is string => Boolean(url));
  const invalidUrlProvided = rawUrls.some((url) => Boolean(text(url)) && !validUrl(url));
  const directEvidence = normalizeDirectEvidence(input.direct_evidence);
  const observedAt = validDate(input.observed_at);
  const externallyProvided = options.external === true;
  const rankPosition = externallyProvided ? rankFromEvidence(directEvidence) : numberOrNull(input.rank_position);
  const bestSellerFlag = externallyProvided
    ? /(?:best\s*seller|mais\s+vendid[oa]|campe[aã]o\s+de\s+vendas)/i.test(evidenceText(directEvidence))
    : input.best_seller_flag === true;
  const priceMin = externallyProvided ? null : numberOrNull(input.observed_price_min);
  const priceMax = externallyProvided ? null : numberOrNull(input.observed_price_max);
  const discount = externallyProvided ? null : numberOrNull(input.discount_percent);
  const rating = externallyProvided ? null : numberOrNull(input.rating);
  const hasCommercialEvidence = rankPosition !== null || bestSellerFlag || priceMin !== null || priceMax !== null || discount !== null || rating !== null;
  const evidenceStatus = deriveEvidenceStatus({ productTerm, sourceUrls, observedAt, directEvidence, invalidUrlProvided, hasCommercialEvidence });
  const marketplaces = listOfStrings(input.marketplaces);
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
    source_urls: [...new Set(sourceUrls)],
    observed_at: observedAt,
    rank_position: rankPosition,
    best_seller_flag: bestSellerFlag ? true : null,
    trending_flag: externallyProvided ? null : boolOrNull(input.trending_flag),
    campaign_flag: externallyProvided ? null : boolOrNull(input.campaign_flag),
    sold_quantity_observed: externallyProvided ? null : numberOrNull(input.sold_quantity_observed),
    observed_price_min: priceMin,
    observed_price_max: priceMax,
    discount_percent: discount !== null && discount >= 0 && discount <= 100 ? discount : null,
    rating: rating !== null && rating >= 0 && rating <= 5 ? rating : null,
    shipping_signal: externallyProvided ? null : text(input.shipping_signal),
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
    const classification = signal.classification;
    const result = normalizeRadarInput({
      radar_date: signal.observedAt.slice(0, 10),
      product_term: signal.term,
      normalized_product_term: classification?.normalizedProductTerm || signal.term,
      category: classification?.categoryHint,
      marketplaces: opportunity?.marketplace ? [opportunity.marketplace] : [],
      source_types: [signal.sourceName],
      source_urls: sourceUrls,
      observed_at: signal.observedAt,
      direct_evidence: sourceUrls.map((sourceUrl) => ({ claim: `Sinal observado em ${signal.sourceName}.`, source_url: sourceUrl, observed_at: signal.observedAt })),
      inferred_signals: [],
      trending_flag: signal.source === "google_trends" ? true : null,
      match_status: opportunity?.matchStatus || "pending",
      opportunity_id: opportunity?.id || null
    });
    if (classification?.decision === "rejected") return { ...result, evidence_status: "rejected", confidence: 0, affiliate_potential: "low", visual_content_potential: "unassessed" };
    if (!classification) return { ...result, evidence_status: "unverified", confidence: 0, affiliate_potential: "unassessed", visual_content_potential: "unassessed" };
    return result;
  });
}
import type { TrendOpportunityListItem, TrendSignalListItem } from "@/core/trends/types";
