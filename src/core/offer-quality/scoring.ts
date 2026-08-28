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
  price: 10,
  discount: 25,
  trust: 20,
  socialProof: 20,
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

  // Preço baixo, sozinho, não representa qualidade. O componente de preço
  // passa a medir valor/economia comprovada, removendo o bônus automático
  // que fazia acessórios baratos superarem produtos principais.
  const savingsTarget = Math.max(50, candidate.currentPrice * 0.25);
  const savingsSignal = discount.confidence === "verified"
    ? Math.min(1, discount.savings / savingsTarget)
    : 0;
  const price = clamp(WEIGHTS.price * (discount.confidence === "verified" ? 0.4 + (0.6 * savingsSignal) : 0.25));
  const discountPoints = discount.confidence === "verified"
    ? clamp((discount.percent / 60) * WEIGHTS.discount)
    : 0;
  const rating = metricNumber(candidate, "rating", "sellerRating");
  const sales = metricNumber(candidate, "sales", "reviewCount", "sellerSales");
  const officialStore = Boolean(candidate.marketplaceMetrics.officialStoreId || candidate.marketplaceMetrics.official_store_id);
  const bestSeller = Boolean(candidate.marketplaceMetrics.bestSeller || candidate.marketplaceMetrics.isBestSeller || candidate.marketplaceMetrics.best_seller);
  const trustBase = rating >= 4.7 ? 0.8 : rating >= 4.5 ? 0.6 : rating >= 4 ? 0.3 : 0;
  const trust = clamp(Math.min(1, trustBase + (officialStore ? 0.2 : 0)) * WEIGHTS.trust);
  const socialProof = clamp(Math.min(1, Math.log10(sales + 1) / 4) * WEIGHTS.socialProof);
  const logistics = candidate.marketplaceMetrics.shippingFree || candidate.marketplaceMetrics.hasFreeShipping
    ? WEIGHTS.logistics
    : WEIGHTS.logistics * 0.25;
  const desireBase = (discount.confidence === "verified" ? 0.45 : 0.10)
    + (rating >= 4.7 ? 0.25 : rating >= 4.5 ? 0.15 : 0)
    + (sales >= 1000 ? 0.15 : sales >= 100 ? 0.08 : 0)
    + (bestSeller ? 0.15 : 0);
  const desire = clamp(Math.min(1, desireBase) * WEIGHTS.desire);

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
      `savings=${discount.savings.toFixed(2)}`,
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
  if (aDiscount.savings !== bDiscount.savings) return bDiscount.savings - aDiscount.savings;
  return a.nativeIdentity.localeCompare(b.nativeIdentity);
}

export { WEIGHTS as OFFER_QUALITY_WEIGHTS };
