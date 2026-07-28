import type {
  DiscountResult,
  OfferQualityCandidate,
  ScoreBreakdown,
} from "./types";

export interface ScoringContext {
  blockers?: readonly string[];
  monetizationComplete?: boolean;
}

const WEIGHTS = Object.freeze({
  price: 25,
  discount: 20,
  trust: 15,
  socialProof: 15,
  logistics: 10,
  desire: 15,
});

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateDiscount(candidate: OfferQualityCandidate): DiscountResult {
  const current = candidate.currentPrice;
  const original = candidate.originalPrice ?? 0;
  if (!(original > current && current > 0)) {
    return { percent: 0, savings: 0, confidence: "none", reason: "no_valid_previous_price" };
  }
  const evidence = candidate.discountEvidence ?? candidate.marketplaceMetrics.priceHistoryVerified;
  return {
    percent: Number((((original - current) / original) * 100).toFixed(2)),
    savings: Number((original - current).toFixed(2)),
    confidence: evidence ? "verified" : "unverified",
    reason: evidence ? "explicit_price_evidence" : "mathematical_only",
  };
}

function metricNumber(candidate: OfferQualityCandidate, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(candidate.marketplaceMetrics[key]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

export function scoreCandidate(
  candidate: OfferQualityCandidate,
  context: ScoringContext = {},
): ScoreBreakdown {
  const blockers = [...(context.blockers ?? [])];
  if (context.monetizationComplete === false) blockers.push("missing_monetization");

  if (!Number.isFinite(candidate.currentPrice) || candidate.currentPrice <= 0) {
    blockers.push("invalid_price");
  }

  const discount = calculateDiscount(candidate);
  if (blockers.length) {
    return {
      total: 0,
      version: "offer-quality-v1",
      price: 0,
      discount: 0,
      trust: 0,
      socialProof: 0,
      logistics: 0,
      desire: 0,
      blockers: [...new Set(blockers)],
      reasons: ["hard_blocker"],
    };
  }

  const price = clamp(WEIGHTS.price * (candidate.currentPrice <= 120 ? 1 : candidate.currentPrice <= 700 ? 0.7 : 0.4));
  const discountPoints = discount.confidence === "verified"
    ? clamp((discount.percent / 80) * WEIGHTS.discount)
    : 0;
  const rating = metricNumber(candidate, "rating", "sellerRating");
  const sales = metricNumber(candidate, "sales", "reviewCount", "sellerSales");
  const trust = clamp((rating >= 4.7 ? 1 : rating >= 4.5 ? 0.65 : rating >= 4 ? 0.35 : 0) * WEIGHTS.trust);
  const socialProof = clamp(Math.min(1, Math.log10(sales + 1) / 4) * WEIGHTS.socialProof);
  const logistics = candidate.marketplaceMetrics.shippingFree || candidate.marketplaceMetrics.hasFreeShipping
    ? WEIGHTS.logistics
    : WEIGHTS.logistics * 0.25;
  const desire = clamp(
    (discount.confidence === "verified" ? 0.5 : 0.2) * WEIGHTS.desire
      + (rating >= 4.7 ? 0.5 : 0)
      + (candidate.currentPrice <= 120 ? 2 : 0),
  );

  const total = Number(clamp(price + discountPoints + trust + socialProof + logistics + desire).toFixed(2));
  return {
    total,
    version: "offer-quality-v1",
    price: Number(price.toFixed(2)),
    discount: Number(discountPoints.toFixed(2)),
    trust: Number(trust.toFixed(2)),
    socialProof: Number(socialProof.toFixed(2)),
    logistics: Number(logistics.toFixed(2)),
    desire: Number(desire.toFixed(2)),
    blockers: [],
    reasons: [
      `discount_confidence=${discount.confidence}`,
      `price=${candidate.currentPrice.toFixed(2)}`,
    ],
  };
}

export function compareCandidates(
  a: OfferQualityCandidate,
  b: OfferQualityCandidate,
): number {
  const aScore = scoreCandidate(a).total;
  const bScore = scoreCandidate(b).total;
  if (aScore !== bScore) return bScore - aScore;
  const aDiscount = calculateDiscount(a);
  const bDiscount = calculateDiscount(b);
  if (aDiscount.confidence !== bDiscount.confidence) {
    return aDiscount.confidence === "verified" ? -1 : 1;
  }
  if (a.currentPrice !== b.currentPrice) return a.currentPrice - b.currentPrice;
  return a.nativeIdentity.localeCompare(b.nativeIdentity);
}

export { WEIGHTS as OFFER_QUALITY_WEIGHTS };
