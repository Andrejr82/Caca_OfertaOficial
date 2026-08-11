import type { DailyTrendRadarResult } from "@/core/trends/daily-radar";
import {
  calculateCommercialOpportunityScoreV2,
  type CommercialOpportunityScoreV2,
  type VerifiedInternalPerformance,
} from "@/core/trends/commercial-opportunity-score-v2";

export interface ExecutiveRadarRankingOptions {
  asOf: string | Date;
  internalPerformanceByProduct?: Record<string, VerifiedInternalPerformance | undefined>;
}

export interface ExecutiveRadarRankingItem {
  priority: number;
  isFocus: boolean;
  result: DailyTrendRadarResult;
  score: CommercialOpportunityScoreV2;
  determiningReasons: string[];
}

function reasons(result: DailyTrendRadarResult, score: CommercialOpportunityScoreV2): string[] {
  const evidenceParts: string[] = [];
  if (result.best_seller_flag === true) evidenceParts.push("best seller observado");
  if (result.rank_position !== null) evidenceParts.push(`posição ${result.rank_position} observada`);
  if (result.source_count > 1) evidenceParts.push(`${result.source_count} fontes convergentes`);
  if (result.discount_percent !== null) evidenceParts.push(`${result.discount_percent}% de desconto observado`);
  if (result.rating !== null) evidenceParts.push(`rating ${result.rating} observado`);
  if (evidenceParts.length === 0) evidenceParts.push("evidência comercial parcial validada");

  const scoreParts = Object.entries(score.breakdown)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, value]) => `${key} +${value}`);

  return [
    `Evidência: ${evidenceParts.join("; ")}.`,
    `Recomendação: score ${score.total}/100${scoreParts.length ? ` (${scoreParts.join(", ")})` : ""}.`,
  ];
}

export function buildExecutiveRadarRanking(
  results: DailyTrendRadarResult[],
  options: ExecutiveRadarRankingOptions,
): ExecutiveRadarRankingItem[] {
  return results
    .filter((result) => result.evidence_status === "verified" || result.evidence_status === "partial")
    .map((result) => {
      const internalPerformance = options.internalPerformanceByProduct?.[result.normalized_product_term];
      return {
        result,
        score: calculateCommercialOpportunityScoreV2(result, {
          asOf: options.asOf,
          internalPerformance,
        }),
      };
    })
    .sort((a, b) => {
      if (b.score.total !== a.score.total) return b.score.total - a.score.total;
      const termOrder = a.result.normalized_product_term.localeCompare(b.result.normalized_product_term, "pt-BR");
      if (termOrder !== 0) return termOrder;
      return a.result.marketplaces.join("|").localeCompare(b.result.marketplaces.join("|"), "pt-BR");
    })
    .slice(0, 20)
    .map(({ result, score }, index) => ({
      priority: index + 1,
      isFocus: index < 3,
      result,
      score,
      determiningReasons: reasons(result, score),
    }));
}
