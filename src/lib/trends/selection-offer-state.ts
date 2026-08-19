export type TrendOfferHandoffResolution = "reuse" | "select" | "reject";

export type TrendOfferHandoffBlock = {
  code: "offer_rejected" | "offer_unavailable";
  message: string;
};

export const TREND_REJECTED_OFFER_MESSAGE = "Esta oportunidade está vinculada a uma oferta rejeitada. Ignore-a ou aguarde nova oportunidade.";

export function supportsTrendApprovalMarketplace(marketplace: string | null | undefined): boolean {
  return marketplace === "Shopee" || marketplace === "Mercado Livre";
}

export function resolveTrendOfferHandoff(status: string): TrendOfferHandoffResolution {
  if (status === "selected" || status === "approved") return "reuse";
  if (status === "pending_manual_review") return "select";
  return "reject";
}

export function resolveTrendOfferHandoffBlock(status: string): TrendOfferHandoffBlock | null {
  if (resolveTrendOfferHandoff(status) !== "reject") return null;
  if (status === "rejected") {
    return { code: "offer_rejected", message: TREND_REJECTED_OFFER_MESSAGE };
  }
  return {
    code: "offer_unavailable",
    message: `Esta oportunidade está vinculada a uma oferta em estado ${status || "desconhecido"} e não pode ser aprovada automaticamente.`,
  };
}

export function resolveTrendSnapshotImageUrl(evidence: Record<string, unknown>): string | null {
  const raw = String(evidence.image_url ?? "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}
