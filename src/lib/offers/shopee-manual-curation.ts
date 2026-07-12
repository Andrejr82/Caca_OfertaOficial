import type { OfferStatus, Platform } from "@/types/domain";

type ManualAction = "select" | "reject";
type GateOffer = { platform: Platform | string; status: OfferStatus | string };

export function nextShopeeManualStatus(current: string, action?: ManualAction): OfferStatus {
  if (current === "discovered" && !action) return "pending_manual_review";
  if (current === "pending_manual_review" && action === "select") return "selected";
  if (current === "pending_manual_review" && action === "reject") return "rejected";
  throw new Error(`Transição Shopee V5 inválida: ${current}:${action || "none"}`);
}

export function assertShopeeSelected(offer: GateOffer): void {
  if (offer.platform === "Shopee" && offer.status !== "selected") {
    throw new Error("Shopee V5 exige seleção manual antes de gerar IA ou links.");
  }
}

export function assertShopeePublishable(offer: GateOffer): void {
  if (offer.platform === "Shopee" && !["selected", "posted"].includes(offer.status)) {
    throw new Error("Shopee V5 exige seleção manual antes da publicação.");
  }
}
