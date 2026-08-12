import type { TrendOfferCandidate } from "@/core/trends/offer-matching";

export interface CommercialScoreBreakdown {
  price: number;
  discount: number;
  commission: number;
  rating: number;
  demand: number;
  reputation: number;
  missingDataPenalty: number;
}

export interface CommercialScoreResult {
  commercialScore: number;
  breakdown: CommercialScoreBreakdown;
  evidenceCount: number;
  minimumEvidenceMet: boolean;
  queueEligible: boolean;
  exclusionReason: string | null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function percentage(value: unknown): number | null {
  const result = number(value);
  if (result == null) return null;
  return result <= 1 ? result * 100 : result;
}

function metric(candidate: TrendOfferCandidate, ...keys: string[]): unknown {
  const values = candidate.marketplaceMetrics ?? {};
  return keys.map((key) => values[key]).find((value) => value !== null && value !== undefined && value !== "") ?? null;
}

export function calculateCommercialScore(candidate: TrendOfferCandidate): CommercialScoreResult {
  const currentPrice = number(candidate.currentPrice);
  const discount = percentage(metric(candidate, "discount", "discountPercent"));
  const commission = percentage(metric(candidate, "commission", "commissionRate", "estimatedCommission"));
  const rating = number(metric(candidate, "rating", "reviewsRating"));
  const sales = number(metric(candidate, "sales", "soldQuantity", "sold"));
  const position = number(metric(candidate, "sourcePosition", "ranking"));
  const reputation = metric(candidate, "sellerReputation", "reputation");
  const evidenceCount = [discount, commission, rating, sales, position, reputation].filter((value) => value !== null).length;
  const breakdown: CommercialScoreBreakdown = {
    price: currentPrice != null && currentPrice > 0 ? 15 : 0,
    discount: discount == null ? 0 : Math.min(15, Math.max(0, discount / 4)),
    commission: commission == null ? 0 : Math.min(15, Math.max(0, commission)),
    rating: rating == null ? 0 : Math.min(15, Math.max(0, (rating / 5) * 15)),
    demand: sales != null ? Math.min(12, Math.max(0, Math.log10(Math.max(1, sales)) * 4)) : position == null ? 0 : Math.min(12, Math.max(0, 12 - (position - 1) * 0.5)),
    reputation: reputation == null ? 0 : 8,
    missingDataPenalty: Math.min(10, Math.max(0, (6 - evidenceCount) * 2))
  };
  const missingDataPenalty = Math.min(10, Math.max(0, (6 - evidenceCount) * 2));
  breakdown.missingDataPenalty = missingDataPenalty;
  const commercialScore = Number(Math.max(0, Math.min(100,
    breakdown.price + breakdown.discount + breakdown.commission + breakdown.rating + breakdown.demand + breakdown.reputation - missingDataPenalty,
  )).toFixed(2));
  const minimumEvidenceMet = currentPrice != null && currentPrice > 0 && Boolean(candidate.itemId || candidate.productId || candidate.shopeeItemId) && evidenceCount >= 2;
  return {
    commercialScore,
    breakdown,
    evidenceCount,
    minimumEvidenceMet,
    queueEligible: minimumEvidenceMet && commercialScore >= 40,
    exclusionReason: minimumEvidenceMet && commercialScore >= 40 ? null : "evidencia_comercial_minima_insuficiente"
  };
}
