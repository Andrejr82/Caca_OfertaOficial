import { computeIdentityGroups } from "./identity-groups";
import type { CandidateDecisionV2 } from "./types";

export interface PortfolioSelectorLimits {
  maxTotal?: number;
  maxPerMarketplace?: number;
  maxPerCategory?: number;
  maxPerFamily?: number;
  maxPerSeller?: number;
}

export interface PortfolioSelectionResult {
  selected: readonly CandidateDecisionV2[];
  rejected: readonly {
    candidate: CandidateDecisionV2;
    reason: string;
  }[];
  counts: {
    total: number;
    byMarketplace: Record<string, number>;
    byCategory: Record<string, number>;
  };
}

const DEFAULT_LIMITS: Required<PortfolioSelectorLimits> = Object.freeze({
  maxTotal: 30,
  maxPerMarketplace: 10,
  maxPerCategory: 10,
  maxPerFamily: 1,
  maxPerSeller: 3,
});

export function selectCommercialPortfolioV2(
  candidates: readonly CandidateDecisionV2[],
  options: PortfolioSelectorLimits = {},
): PortfolioSelectionResult {
  const limits = { ...DEFAULT_LIMITS, ...options };

  // 1. Ordenação determinística: maior score total -> menor preço -> nativeIdentity
  const pool = [...candidates].sort((a, b) => {
    const scoreDiff = b.score.total - a.score.total;
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    const priceDiff = a.evidence.currentPrice - b.evidence.currentPrice;
    if (Math.abs(priceDiff) > 0.01) return priceDiff;
    return a.nativeIdentity.localeCompare(b.nativeIdentity);
  });

  const selected: CandidateDecisionV2[] = [];
  const rejected: Array<{ candidate: CandidateDecisionV2; reason: string }> = [];

  const marketplaceCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const familyCounts: Record<string, number> = {};
  const sellerCounts: Record<string, number> = {};

  for (const candidate of pool) {
    const marketplace = candidate.marketplace;
    const category = candidate.classification.productType || "geral";
    const identity = computeIdentityGroups(candidate);
    const family = identity.familyKey || identity.exactKey;
    const seller = String(candidate.evidence.provenance[0] || "default_seller");

    let rejectionReason: string | null = null;

    if (selected.length >= limits.maxTotal) {
      rejectionReason = "limite_total";
    } else if ((marketplaceCounts[marketplace] || 0) >= limits.maxPerMarketplace) {
      rejectionReason = "limite_marketplace";
    } else if ((categoryCounts[category] || 0) >= limits.maxPerCategory) {
      rejectionReason = "limite_categoria";
    } else if ((familyCounts[family] || 0) >= limits.maxPerFamily) {
      rejectionReason = "limite_familia";
    } else if ((sellerCounts[seller] || 0) >= limits.maxPerSeller) {
      rejectionReason = "limite_vendedor";
    }

    if (rejectionReason) {
      const updatedCandidate: CandidateDecisionV2 = {
        ...candidate,
        decision: "rejected",
        reasons: [
          ...candidate.reasons,
          {
            stage: "portfolio_selection",
            code: rejectionReason.toUpperCase(),
            message: `Rejeitado na seleção de portfólio por: ${rejectionReason}`,
          },
        ],
      };
      rejected.push({ candidate: updatedCandidate, reason: rejectionReason });
    } else {
      const updatedCandidate: CandidateDecisionV2 = {
        ...candidate,
        decision: "selected",
      };
      selected.push(updatedCandidate);
      marketplaceCounts[marketplace] = (marketplaceCounts[marketplace] || 0) + 1;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      familyCounts[family] = (familyCounts[family] || 0) + 1;
      sellerCounts[seller] = (sellerCounts[seller] || 0) + 1;
    }
  }

  return Object.freeze({
    selected: Object.freeze(selected),
    rejected: Object.freeze(rejected),
    counts: Object.freeze({
      total: selected.length,
      byMarketplace: Object.freeze(marketplaceCounts),
      byCategory: Object.freeze(categoryCounts),
    }),
  });
}
