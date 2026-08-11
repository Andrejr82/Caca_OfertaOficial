import type { DailyTrendRadarResult, RadarDirectEvidence } from "@/core/trends/daily-radar";

export interface VerifiedInternalPerformance {
  verified: boolean;
  score: number;
}

export interface CommercialOpportunityScoreV2Options {
  internalPerformance?: VerifiedInternalPerformance | null;
  asOf?: string | Date;
}

export interface CommercialOpportunityScoreV2Breakdown {
  evidenceQuality: number;
  sourceConvergence: number;
  marketplaceDemand: number;
  internalPerformance: number;
  commercialAttractiveness: number;
  recency: number;
}

export interface CommercialOpportunityScoreV2 {
  total: number;
  breakdown: CommercialOpportunityScoreV2Breakdown;
}

export interface RankedCommercialOpportunityV2 {
  result: DailyTrendRadarResult;
  score: CommercialOpportunityScoreV2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function evidenceQuality(result: DailyTrendRadarResult): number {
  if (result.evidence_status === "verified") return 30;
  if (result.evidence_status === "partial") return 15;
  return 0;
}

function sourceConvergence(result: DailyTrendRadarResult): number {
  const distinctSourceTypes = new Set(result.source_types.filter(Boolean)).size;
  const distinctSourceUrls = new Set([
    ...result.source_urls.filter(Boolean),
    ...result.direct_evidence
      .map((item) => item.source_url)
      .filter((value): value is string => Boolean(value)),
  ]).size;
  const distinctSources = Math.max(distinctSourceTypes, distinctSourceUrls);

  if (distinctSources >= 3) return 20;
  if (distinctSources === 2) return 12;
  return 0;
}

function isMarketplaceEvidence(item: RadarDirectEvidence): boolean {
  if (Object.values(item.marketplace_identity).some((value) => Boolean(value))) return true;
  return /(?:shopee|mercado[_ -]?livre|best[_ -]?seller|marketplace|offer|product|campaign)/iu.test(item.evidence_type ?? "");
}

function marketplaceDemand(result: DailyTrendRadarResult): number {
  const marketplaceEvidence = result.direct_evidence.filter(isMarketplaceEvidence);
  if (marketplaceEvidence.length === 0) return 0;

  const hasBestSeller = marketplaceEvidence.some((item) => item.best_seller_flag === true);
  const ranks = marketplaceEvidence
    .map((item) => item.rank_position)
    .filter((value): value is number => value !== null);
  const bestRank = ranks.length > 0 ? Math.min(...ranks) : null;
  const hasSoldQuantity = marketplaceEvidence.some((item) => (item.sold_quantity ?? 0) > 0);
  const hasMarketplaceTrending = marketplaceEvidence.some((item) => item.trending_flag === true);

  let score = hasBestSeller ? 10 : 0;
  if (bestRank !== null) {
    score += bestRank <= 10 ? 10 : bestRank <= 20 ? 8 : bestRank <= 50 ? 5 : 2;
  }
  if (hasSoldQuantity) score += 5;
  if (hasMarketplaceTrending) score += 5;
  return clamp(score, 0, 20);
}

function internalPerformance(options: CommercialOpportunityScoreV2Options): number {
  const input = options.internalPerformance;
  if (!input?.verified || !Number.isFinite(input.score)) return 0;
  return clamp(input.score, 0, 15);
}

function commercialAttractiveness(result: DailyTrendRadarResult): number {
  let score = 0;
  if (result.observed_price_min !== null) score += 2;
  if ((result.discount_percent ?? 0) > 0) score += 3;
  if ((result.rating ?? 0) >= 4) score += 2;
  if (result.shipping_signal) score += 2;
  if (result.affiliate_potential === "high") score += 1;
  return clamp(score, 0, 10);
}

function parseDate(value: string | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function deterministicAsOf(result: DailyTrendRadarResult, value?: string | Date): Date | null {
  if (value !== undefined) return parseDate(value);
  return parseDate(`${result.radar_date}T23:59:59.999Z`);
}

function recency(result: DailyTrendRadarResult, options: CommercialOpportunityScoreV2Options): number {
  if (!result.observed_at) return 0;
  const observedAt = parseDate(result.observed_at);
  const asOf = deterministicAsOf(result, options.asOf);
  if (!observedAt || !asOf) return 0;

  const ageMs = Math.max(0, asOf.getTime() - observedAt.getTime());
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 1) return 5;
  if (ageDays <= 3) return 4;
  if (ageDays <= 7) return 3;
  if (ageDays <= 14) return 1;
  return 0;
}

export function calculateCommercialOpportunityScoreV2(
  result: DailyTrendRadarResult,
  options: CommercialOpportunityScoreV2Options = {},
): CommercialOpportunityScoreV2 {
  if (result.evidence_status === "unverified" || result.evidence_status === "rejected") {
    return {
      total: 0,
      breakdown: {
        evidenceQuality: 0,
        sourceConvergence: 0,
        marketplaceDemand: 0,
        internalPerformance: 0,
        commercialAttractiveness: 0,
        recency: 0,
      },
    };
  }

  const breakdown: CommercialOpportunityScoreV2Breakdown = {
    evidenceQuality: evidenceQuality(result),
    sourceConvergence: sourceConvergence(result),
    marketplaceDemand: marketplaceDemand(result),
    internalPerformance: internalPerformance(options),
    commercialAttractiveness: commercialAttractiveness(result),
    recency: recency(result, options),
  };

  return {
    breakdown,
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  };
}

export function rankCommercialOpportunitiesV2(
  results: DailyTrendRadarResult[],
  options: CommercialOpportunityScoreV2Options = {},
): RankedCommercialOpportunityV2[] {
  return results
    .map((result) => ({ result, score: calculateCommercialOpportunityScoreV2(result, options) }))
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      const termOrder = a.result.normalized_product_term.localeCompare(b.result.normalized_product_term, "pt-BR");
      if (termOrder !== 0) return termOrder;
      const marketplaceA = a.result.marketplaces.join("|");
      const marketplaceB = b.result.marketplaces.join("|");
      return marketplaceA.localeCompare(marketplaceB, "pt-BR");
    });
}
