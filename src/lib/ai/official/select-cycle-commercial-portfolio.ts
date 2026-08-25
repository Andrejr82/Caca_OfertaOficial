import { selectCommercialPortfolio, type CommercialPortfolioOffer } from "@/core/curation/commercial-portfolio-selector";

export interface CycleCommercialPortfolioResult {
  selectedOfferIds: readonly string[];
  received: number;
  selected: number;
  rejected: number;
  rejectionReasons: Readonly<Record<string, number>>;
}

export async function selectCycleCommercialPortfolio(
  supabase: any,
  userId: string,
  offerIds: readonly string[],
): Promise<CycleCommercialPortfolioResult> {
  const uniqueOfferIds = [...new Set(offerIds.filter(Boolean))];
  if (uniqueOfferIds.length <= 1) {
    return { selectedOfferIds: uniqueOfferIds, received: uniqueOfferIds.length, selected: uniqueOfferIds.length, rejected: 0, rejectionReasons: {} };
  }

  const { data, error } = await supabase
    .from("offers")
    .select("id, product_name, platform, current_price, old_price, category, explainability, status")
    .eq("user_id", userId)
    .in("id", uniqueOfferIds);

  if (error) throw new Error(`Falha ao carregar coorte comercial: ${error.message}`);
  const rows = (Array.isArray(data) ? data : []) as CommercialPortfolioOffer[];
  if (rows.length === 0) throw new Error("Coorte comercial vazia após persistência.");

  const maxTotal = Number(process.env.COMMERCIAL_PORTFOLIO_MAX_TOTAL || 18);
  const maxPerType = Number(process.env.COMMERCIAL_PORTFOLIO_MAX_PER_TYPE || 2);
  const portfolio = selectCommercialPortfolio(rows, { maxTotal, maxPerType });
  const rejectionReasons: Record<string, number> = {};
  for (const item of portfolio.rejected) rejectionReasons[item.rejectionReason] = (rejectionReasons[item.rejectionReason] ?? 0) + 1;

  return Object.freeze({
    selectedOfferIds: Object.freeze(portfolio.selected.map((item) => item.offer.id)),
    received: uniqueOfferIds.length,
    selected: portfolio.selected.length,
    rejected: portfolio.rejected.length,
    rejectionReasons: Object.freeze(rejectionReasons),
  });
}
