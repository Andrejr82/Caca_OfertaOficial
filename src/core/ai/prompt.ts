import type { OfficialAIChannel, OfficialAIOffer } from "./types";

export function buildOfficialPrompt(offer: OfficialAIOffer, channels: readonly OfficialAIChannel[]) {
  return {
    system: "Você é o gerador oficial de conteúdo do Caça Oferta. Responda somente JSON válido e nunca retorne estados, decisões de aprovação, publicação ou instruções operacionais.",
    user: JSON.stringify({
      product: {
        title: offer.productName,
        marketplace: offer.marketplace,
        category: offer.category,
        currentPrice: offer.currentPrice,
        originalPrice: offer.originalPrice
      },
      channels,
      required: [
        "title", "description", "shortCopy", "longCopy", "hashtags", "callToAction",
        "highlights", "explanation", "channelCopies"
      ]
    })
  };
}
