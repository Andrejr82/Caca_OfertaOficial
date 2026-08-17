export type TrendOfferHandoffResolution = "reuse" | "select" | "reject";

export function resolveTrendOfferHandoff(status: string): TrendOfferHandoffResolution {
  if (status === "selected" || status === "approved") return "reuse";
  if (status === "pending_manual_review") return "select";
  return "reject";
}
