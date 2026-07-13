import type { Platform } from "@/types/domain";

type GateOffer = { platform?: Platform | string | null; status?: string | null };

export function assertAmazonSelected(offer: GateOffer): void {
  if (!offer.platform?.trim()) {
    throw new Error("Marketplace inválido para geração de IA.");
  }

  const marketplace = offer.platform.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (marketplace === "amazon" && offer.status !== "selected") {
    throw new Error("Amazon V5 exige seleção manual antes de gerar IA.");
  }
}
