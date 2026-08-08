import type { Offer } from "@/types/domain";
import { deduplicateCommercialOffers } from "@/lib/offers/catalog-grouping";

// The curation engine is intentionally server-only: it reads current offer rows and never mutates them.
const curation: any = require("../../../scripts/commercial-curation-v1.cjs");

export type CommercialQueueCandidate = Offer & {
  commercialIntent: string;
  achadinhoScore: number;
  automaticEligible: boolean;
  manualReviewRequired: boolean;
  commercialReasons: string[];
  commercialRiskFlags: string[];
  recommendedChannel: string;
  suggestedCopy: string;
  commercialMetadata: Record<string, unknown>;
  rejected: boolean;
};

const PROTECTED_OPERATIONAL_STATUSES = new Set(["posted", "approved", "selected", "rejected", "deferred", "deleted"]);

export function discoveryCorrelationId(offer: Partial<Offer>): string | null {
  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability : null;
  const value = (explainability as { correlation_id?: unknown } | null)?.correlation_id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function discoveryStartedAt(offer: Partial<Offer>): number | null {
  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability as Record<string, unknown> : null;
  const evidence = explainability?.discovery_evidence;
  const discoveredAt = evidence && typeof evidence === "object" ? (evidence as { discoveredAt?: unknown }).discoveredAt : null;
  const timestamp = typeof discoveredAt === "string" || typeof discoveredAt === "number" ? new Date(discoveredAt).getTime() : NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function brtDayKey(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/**
 * The v2 discovery RPC returns offer_ids for the current correlation_id.
 * Panel queries may persist only part of the evidence, so use correlation_id,
 * discovery_evidence.discoveredAt, or the BRT created_at day as fallbacks.
 * updated_at is never used.
 */
export function identifyLatestDiscoveryCohort(offers: Offer[], now = new Date()): Offer[] {
  const rows = offers.map((offer) => ({
    offer,
    createdAt: new Date(offer.created_at).getTime(),
    correlationId: discoveryCorrelationId(offer),
    discoveredAt: discoveryStartedAt(offer),
  })).filter((row) => Number.isFinite(row.createdAt));
  if (rows.length === 0) return [];

  const correlatedGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.correlationId) continue;
    const group = correlatedGroups.get(row.correlationId) || [];
    group.push(row);
    correlatedGroups.set(row.correlationId, group);
  }

  if (correlatedGroups.size > 0) {
    const latest = [...correlatedGroups.values()].sort((left, right) => Math.max(...right.map((row) => row.createdAt)) - Math.max(...left.map((row) => row.createdAt)))[0];
    const latestDay = brtDayKey(Math.max(...latest.map((row) => row.createdAt)));
    if (latestDay !== brtDayKey(now.getTime())) return [];
    const cycleStart = Math.min(...latest.map((row) => row.discoveredAt).filter((value): value is number => value !== null));
    if (Number.isFinite(cycleStart)) {
      return latest.filter((row) => row.createdAt >= cycleStart).map((row) => row.offer);
    }
    return latest.filter((row) => brtDayKey(row.createdAt) === latestDay).map((row) => row.offer);
  }

  const evidenceGroups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = row.discoveredAt === null ? brtDayKey(row.createdAt) : brtDayKey(row.discoveredAt);
    const group = evidenceGroups.get(key) || [];
    group.push(row);
    evidenceGroups.set(key, group);
  }
  const latest = [...evidenceGroups.values()].sort((left, right) => Math.max(...right.map((row) => row.createdAt)) - Math.max(...left.map((row) => row.createdAt)))[0];
  const latestKey = latest[0].discoveredAt === null ? brtDayKey(latest[0].createdAt) : brtDayKey(latest[0].discoveredAt);
  if (latestKey !== brtDayKey(now.getTime())) return [];
  return latest.filter((row) => (row.discoveredAt === null ? brtDayKey(row.createdAt) : brtDayKey(row.discoveredAt)) === latestKey).map((row) => row.offer);
}

export function filterOperationalPanelOffers(offers: Offer[]): Offer[] {
  return identifyLatestDiscoveryCohort(offers).filter((offer) => {
    const status = String((offer as Offer & { status?: string }).status || "").toLowerCase();
    return !PROTECTED_OPERATIONAL_STATUSES.has(status);
  });
}

function normalizeOffer(offer: Offer) {
  const metrics = offer.marketplace_metrics || {};
  return {
    ...offer,
    marketplace: offer.platform,
    title: offer.product_name,
    price: offer.current_price,
    oldPrice: offer.old_price,
    rating: offer.rating ?? metrics.rating,
    sales: metrics.sales,
    discountPercent: offer.old_price && offer.old_price > offer.current_price
      ? ((offer.old_price - offer.current_price) / offer.old_price) * 100
      : metrics.discount,
    imageUrl: offer.image_url,
    affiliateUrl: offer.original_url,
    categoryName: offer.category_name,
    shippingFree: offer.shipping_free === true,
    marketplaceMetrics: metrics,
    sourceScenarioId: null,
  };
}

export function buildCommercialQueue(offers: Offer[], options: { limit?: number } = {}): CommercialQueueCandidate[] {
  const displayOffers = deduplicateCommercialOffers(offers);
  const rankingOptions = options.limit === undefined ? { includeRejected: true } : { includeRejected: true, limit: options.limit };
  const ranked = curation.rankCommercialOffers(displayOffers.filter((offer) => offer.platform === "Shopee" || offer.platform === "Mercado Livre").map(normalizeOffer), rankingOptions);
  return ranked.map((candidate: any) => {
    const source = displayOffers.find((offer) => offer.id === candidate.id || offer.id === candidate.sourceOfferId);
    const metadata = curation.buildCommercialMetadata(candidate);
    return {
      ...(source || {}),
      commercialIntent: candidate.commercialIntent,
      achadinhoScore: candidate.score,
      automaticEligible: candidate.automaticEligible,
      manualReviewRequired: candidate.manualReviewRequired,
      commercialReasons: candidate.reasons,
      commercialRiskFlags: candidate.risks,
      recommendedChannel: metadata.recommendedChannel,
      suggestedCopy: metadata.suggestedCopy,
      commercialMetadata: metadata,
      rejected: !candidate.decision?.eligible,
    } as CommercialQueueCandidate;
  });
}

export function filterCommercialQueue(candidates: CommercialQueueCandidate[], filters: { marketplace?: string; intent?: string; minScore?: number; risk?: string; mode?: "automatic" | "manual-first" | "rejected" | "" } = {}) {
  return candidates.filter((candidate) => {
    if (filters.marketplace && candidate.platform !== filters.marketplace) return false;
    if (filters.intent && candidate.commercialIntent !== filters.intent) return false;
    if (filters.minScore != null && candidate.achadinhoScore < filters.minScore) return false;
    if (filters.risk && !candidate.commercialRiskFlags.includes(filters.risk)) return false;
    if (filters.mode === "automatic" && !candidate.automaticEligible) return false;
    if (filters.mode === "manual-first" && !candidate.manualReviewRequired) return false;
    if (filters.mode === "rejected" && !candidate.rejected) return false;
    return true;
  });
}
