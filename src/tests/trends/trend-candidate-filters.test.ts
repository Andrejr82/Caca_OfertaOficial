import { describe, expect, it } from "vitest";
import type { TrendOfferCandidate } from "@/core/trends/offer-matching";
import { filterTrendCommercialCandidates } from "@/lib/trends/trend-candidate-filters";

function candidate(overrides: Partial<TrendOfferCandidate> = {}): TrendOfferCandidate {
  return {
    id: "MLB-1",
    marketplace: "Mercado Livre",
    productName: "Air Fryer Mondial 4L",
    itemId: "MLB-1",
    currentPrice: 299,
    permalink: "https://mercadolivre.com.br/MLB-1",
    marketplaceMetrics: {
      imageUrl: "https://img.example/MLB-1.jpg",
      affiliateUrl: "https://mercadolivre.com.br/MLB-1?aff=1"
    },
    ...overrides
  };
}

describe("common commercial candidate filters", () => {
  it("accepts a complete candidate and preserves its data", () => {
    const result = filterTrendCommercialCandidates("Air Fryer 4L", [candidate()]);
    expect(result.accepted).toEqual([candidate()]);
    expect(result.rejected).toEqual([]);
  });

  it("rejects regulated products and incompatible accessories", () => {
    const result = filterTrendCommercialCandidates("Smartphone Galaxy A55", [
      candidate({ id: "weapon", productName: "Airsoft arma" }),
      candidate({ id: "accessory", productName: "Capa para Smartphone Galaxy A55" })
    ]);

    expect(result.accepted).toEqual([]);
    expect(result.rejected.map((item) => item.reason)).toEqual(["regulated_weapon", "accessory_or_variant"]);
  });

  it("rejects missing technical fields and irrelevant titles with reasons", () => {
    const result = filterTrendCommercialCandidates("Notebook Lenovo", [
      candidate({ id: "no-image", productName: "Notebook Lenovo", marketplaceMetrics: { affiliateUrl: "https://example.com/a" } }),
      candidate({ id: "bad-url", productName: "Notebook Lenovo", marketplaceMetrics: { imageUrl: "http://image", affiliateUrl: "https://example.com/a" } }),
      candidate({ id: "no-price", productName: "Notebook Lenovo", currentPrice: 0 }),
      candidate({ id: "irrelevant", productName: "Mouse sem fio", itemId: "M-1" })
    ]);

    expect(result.rejected.map((item) => item.reason)).toEqual(["image_invalid", "image_invalid", "price_invalid", "term_mismatch"]);
  });

  it("rejects accessory and personalization variants for a trend product", () => {
    const result = filterTrendCommercialCandidates("calendario 2026", [
      candidate({ id: "magnet", productName: "Imã de geladeira com calendário 2026 personalizado" }),
      candidate({ id: "chair-part", productName: "Kit rodizios para cadeira gamer" }),
      candidate({ id: "calendar", productName: "Calendário de parede 2026" }),
    ]);

    expect(result.accepted.map((item) => item.id)).toEqual(["calendar"]);
    expect(result.rejected.map((item) => item.reason)).toEqual(["accessory_or_variant", "accessory_or_variant"]);
  });
});
