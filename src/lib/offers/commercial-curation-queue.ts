import type { Offer } from "@/types/domain";

// The curation engine is intentionally server-only: it reads current offer rows and never mutates them.
// eslint-disable-next-line @typescript-eslint/no-var-requires
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
  const ranked = curation.rankCommercialOffers(offers.filter((offer) => offer.platform === "Shopee" || offer.platform === "Mercado Livre").map(normalizeOffer), { includeRejected: true, limit: options.limit || offers.length });
  return ranked.map((candidate: any) => {
    const source = offers.find((offer) => offer.id === candidate.id || offer.id === candidate.sourceOfferId);
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
