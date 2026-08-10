import { describe, expect, it } from "vitest";
import { normalizeMercadoLivreTrendsResponse } from "@/lib/trends/mercado-livre-trends-adapter";

describe("Mercado Livre Trends adapter", () => {
  it("normaliza tendências oficiais MLB sem inventar volume ou oferta", () => {
    const signals = normalizeMercadoLivreTrendsResponse([
      { keyword: "air fryer mondial", url: "https://lista.mercadolivre.com.br/air-fryer-mondial" },
      ...Array.from({ length: 9 }, (_, index) => ({ keyword: `produto ${index}`, url: null })),
      { keyword: "iphone 17", url: "https://lista.mercadolivre.com.br/iphone-17" }
    ], new Date("2026-08-10T12:00:00.000Z"));

    expect(signals).toHaveLength(11);
    expect(signals[0]).toMatchObject({
      term: "air fryer mondial",
      source: "mercado_livre_trends",
      region: "BR",
      trendStrength: null,
      trendDirection: "rising",
      offerId: null
    });
    expect(signals[0].evidence).toMatchObject({ rank: 1, trendBucket: "fastest_growing", url: "https://lista.mercadolivre.com.br/air-fryer-mondial" });
    expect(signals[10].trendDirection).toBeNull();
  });

  it("ignora entradas sem keyword e preserva external_id estável", () => {
    const signals = normalizeMercadoLivreTrendsResponse([
      { keyword: "  cafeteira  ", url: "https://lista.mercadolivre.com.br/cafeteira" },
      { keyword: "", url: "https://example.invalid" }
    ], new Date("2026-08-10T12:00:00.000Z"));

    expect(signals).toHaveLength(1);
    expect(signals[0].externalId).toBe("MLB:cafeteira");
  });
});
