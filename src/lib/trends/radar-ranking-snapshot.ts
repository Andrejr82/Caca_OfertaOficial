import type { ExecutiveRadarRankingItem } from "@/core/trends/executive-radar-ranking";
import { calculateTrendScore } from "@/core/trends/trend-score";
import type { TrendRadarProductSnapshotInput } from "@/lib/trends/radar-snapshots";

export function toTrendRadarSnapshotProducts(
  ranking: ExecutiveRadarRankingItem[],
): TrendRadarProductSnapshotInput[] {
  return ranking.map(({ priority, isFocus, result, score, determiningReasons }) => ({
    priority,
    productTerm: result.product_term,
    normalizedProductTerm: result.normalized_product_term,
    category: result.category,
    marketplace: result.marketplaces[0] ?? null,
    evidenceStatus: result.evidence_status,
    sourceCount: result.source_count,
    trendScore: calculateTrendScore(
      (result.source_types.length > 0 ? result.source_types : ["trend_signal"]).map((sourceName) => ({
        sourceName,
        observedAt: result.observed_at ?? `${result.radar_date}T00:00:00.000Z`,
        trendDirection: result.trending_flag === true ? "rising" : null,
        sourcePosition: result.rank_position,
      })),
      { now: `${result.radar_date}T23:59:59.999Z` },
    ).trendScore,
    commercialScore: score.total,
    confidence: result.confidence,
    directEvidence: result.direct_evidence,
    inferredSignals: result.inferred_signals,
    affiliatePotential: result.affiliate_potential,
    visualContentPotential: result.visual_content_potential,
    recommendedChannel: null,
    recommendedFormat: null,
    matchStatus: result.match_status,
    opportunityId: result.opportunity_id,
    scoreBreakdown: { ...score.breakdown },
    determiningReasons,
    isFocus,
  }));
}
