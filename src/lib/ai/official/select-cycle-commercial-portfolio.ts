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
  if (uniqueOfferIds.length === 0) {
    return { selectedOfferIds: [], received: 0, selected: 0, rejected: 0, rejectionReasons: {} };
  }

  const { data, error } = await supabase
    .from("offers")
    .select("id, product_name, platform, current_price, old_price, category, explainability, status")
    .eq("user_id", userId)
    .in("id", uniqueOfferIds);

  if (error) throw new Error(`Falha ao carregar coorte comercial: ${error.message}`);
  const rows = (Array.isArray(data) ? data : []) as CommercialPortfolioOffer[];
  const approvedRows = rows.filter((row) => String(row.status || "").toLowerCase() === "approved");
  if (approvedRows.length === 0) throw new Error("Coorte aprovada vazia após persistência.");

  // Discovery has already admitted these offers as approved. Keep the
  // commercial score as a deterministic ordering signal, but do not apply
  // editorial score, diversity or type-cap gates a second time in the normal
  // cycle. The only remaining cap is the technical preparation cap of 30.
  const portfolio = selectCommercialPortfolio(approvedRows, {
    maxTotal: 30,
    maxPerType: 30,
    minScore: 0,
    enforceCommercialFilters: false,
  });
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
