import type { OfferStatus, Platform } from "@/types/domain";

type ManualAction = "select" | "reject";
type GateOffer = { platform: Platform | string; status: OfferStatus | string };
type PublicationOffer = GateOffer & { id: string };

function getManualMarketplaceName(platform: Platform | string) {
  const marketplace = String(platform || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  return {
    shopee: "Shopee",
    mercadolivre: "Mercado Livre",
    amazon: "Amazon"
  }[marketplace];
}

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
  const marketplaceName = getManualMarketplaceName(offer.platform);

  if (marketplaceName && !["selected", "posted"].includes(offer.status)) {
    throw new Error(`${marketplaceName} V5 exige seleção manual antes da publicação.`);
  }
}

export async function prepareOfferForPublication<T extends PublicationOffer>(
  offer: T,
  persistSelection: (offer: T) => Promise<T>
): Promise<T> {
  let publishableOffer = offer;

  if (getManualMarketplaceName(offer.platform) && offer.status === "pending_manual_review") {
    publishableOffer = await persistSelection(offer);
    if (publishableOffer.status !== "selected") {
      throw new Error(`Não foi possível confirmar selected para ${getManualMarketplaceName(offer.platform)}.`);
    }
  }

  assertShopeePublishable(publishableOffer);
  return publishableOffer;
}
