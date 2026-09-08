import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";
import { selectCommercialPortfolioV2 } from "@/core/offer-selection/portfolio-selector";
import type { CandidateDecisionV2 } from "@/core/offer-selection/types";

export interface CycleCommercialPortfolioResult {
  selectedOfferIds: readonly string[];
  received: number;
  selected: number;
  rejected: number;
  rejectionReasons: Readonly<Record<string, number>>;
}

function offerRowToCandidateV2(row: any): CandidateDecisionV2 {
  const candidate = normalizeCandidateToV2({
    marketplace: row.platform,
    sourceItemId: row.id,
    nativeIdentity: row.id,
    title: row.product_name,
    currentPrice: row.current_price,
    originalPrice: row.old_price,
    classification: {
      status: "classified",
      productType: row.category || "geral",
    },
  });

  const explainability = row.explainability || {};
  const score = explainability.score?.total !== undefined
    ? explainability.score
    : {
        total: Number(explainability.score ?? 0),
        semantic: 0,
        evidence: 0,
        value: 0,
        logistics: 0,
        freshness: 0,
        version: "candidate-decision/v2",
      };

  return {
    ...candidate,
    score: {
      ...candidate.score,
      ...score,
    },
  };
}

export async function selectCycleCommercialPortfolio(
  supabase: any,
  userId: string,
  offerIds: readonly string[],
): Promise<CycleCommercialPortfolioResult> {
  const uniqueOfferIds = [...new Set(offerIds.filter(Boolean))];
  if (uniqueOfferIds.length === 0) {
    return { selectedOfferIds: [], received: 0, selected: 0, rejected: 0, rejectionReasons: {} };
  }

  const { data, error } = await supabase
    .from("offers")
    .select("id, product_name, platform, current_price, old_price, category, explainability, status")
    .eq("user_id", userId)
    .in("id", uniqueOfferIds);

  if (error) throw new Error(`Falha ao carregar coorte comercial: ${error.message}`);
  const rows = (Array.isArray(data) ? data : []) as any[];
  const approvedRows = rows.filter((row) => String(row.status || "").toLowerCase() === "approved");
  if (approvedRows.length === 0) throw new Error("Coorte aprovada vazia após persistência.");

  const candidates = approvedRows.map(offerRowToCandidateV2);
  const portfolio = selectCommercialPortfolioV2(candidates, {
    maxTotal: 30,
    maxPerMarketplace: 30,
    maxPerCategory: 30,
    maxPerFamily: 30,
    maxPerSeller: 30,
  });

  const rejectionReasons: Record<string, number> = {};
  for (const item of portfolio.rejected) {
    rejectionReasons[item.reason] = (rejectionReasons[item.reason] ?? 0) + 1;
  }

  return Object.freeze({
    selectedOfferIds: Object.freeze(portfolio.selected.map((item) => item.sourceItemId)),
    received: uniqueOfferIds.length,
    selected: portfolio.selected.length,
    rejected: portfolio.rejected.length,
    rejectionReasons: Object.freeze(rejectionReasons),
  });
}
