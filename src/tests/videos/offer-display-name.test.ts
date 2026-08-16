import { describe, it, expect } from "vitest";
import { getVideoOfferDisplayName } from "@/lib/videos/offer-display-name";

describe("nome exibido da oferta em Vídeos", () => {
  it("usa short_name quando o contrato o fornece", () => {
    expect(getVideoOfferDisplayName({
      product_name: "Tênis Casual Masculino Caminhada Confortável Antiderrapante",
      short_name: "Tênis casual"
    })).toBe("Tênis casual");
  });

  it("gera fallback curto e legível quando short_name está ausente", () => {
    expect(getVideoOfferDisplayName({
      product_name: "Mixer 3 Em 1 Power Inox Elgin 1000W MIX3X Triturador Inox Shopee Brasil",
      short_name: null
    })).toBe("Mixer 3 Em 1 Power Inox");
  });
});
