import { describe, expect, it } from "vitest";
import type { DailyTrendRadarResult } from "@/core/trends/daily-radar";
import { buildStrongestNiches7d } from "@/core/trends/strongest-niches-7d";

function radar(overrides: Partial<DailyTrendRadarResult> = {}): DailyTrendRadarResult {
  return {
    radar_date: "2026-08-10",
    product_term: "Fone Bluetooth",
    normalized_product_term: "fone bluetooth",
    category: "Eletrônicos",
    marketplaces: ["Mercado Livre"],
    source_types: ["mercado_livre_best_seller"],
    source_urls: ["https://www.mercadolivre.com.br/a"],
    observed_at: "2026-08-10T18:00:00.000Z",
    rank_position: 3,
    best_seller_flag: true,
    trending_flag: null,
    campaign_flag: null,
    sold_quantity_observed: null,
    observed_price_min: 99.9,
    observed_price_max: 119.9,
    discount_percent: 20,
    rating: 4.8,
    shipping_signal: "free_shipping",
    direct_evidence: [{
      claim: "Produto no ranking oficial.",
      evidence_type: "mercado_livre_best_seller",
      source_url: "https://www.mercadolivre.com.br/a",
      observed_at: "2026-08-10T18:00:00.000Z",
      rank_position: 3,
      best_seller_flag: true,
      trending_flag: null,
      sold_quantity: null,
      price: 99.9,
      old_price: 124.9,
      discount_percent: 20,
      rating: 4.8,
      review_count: 300,
      shipping: "free_shipping",
      marketplace_identity: { item_id: "MLB123" },
    }],
    inferred_signals: [],
    source_count: 1,
    evidence_status: "verified",
    confidence: 100,
    affiliate_potential: "high",
    visual_content_potential: "medium",
    demand_reason: "Evidência comercial.",
    rank: null,
    strategy_version: "daily-commercial-radar-v1",
    match_status: "pending",
    opportunity_id: null,
    ...overrides,
  };
}

describe("Strongest niches in 7 days", () => {
  it("agrupa por nicho e mantém produtos principais por score auditável", () => {
    const input = [
      radar(),
      radar({
        product_term: "Smartwatch",
        normalized_product_term: "smartwatch",
        source_types: ["shopee_product_offer"],
        source_urls: ["https://shopee.com.br/b"],
        marketplaces: ["Shopee"],
        observed_at: "2026-08-09T18:00:00.000Z",
        direct_evidence: [{
          ...radar().direct_evidence[0],
          claim: "Oferta Shopee observada.",
          evidence_type: "shopee_product_offer",
          source_url: "https://shopee.com.br/b",
          observed_at: "2026-08-09T18:00:00.000Z",
          rank_position: null,
          best_seller_flag: null,
          marketplace_identity: { shop_id: "1", item_id: "2" },
        }],
      }),
    ];

    const niches = buildStrongestNiches7d(input, { asOf: "2026-08-10T23:00:00.000Z" });

    expect(niches).toHaveLength(1);
    expect(niches[0].niche).toBe("Eletrônicos");
    expect(niches[0].productCount).toBe(2);
    expect(niches[0].sourceCount).toBe(2);
    expect(niches[0].topProducts.map((item) => item.normalizedProductTerm)).toEqual(["fone bluetooth", "smartwatch"]);
  });

  it("ignora sinais fora da janela de sete dias e evidência rejeitada/unverified", () => {
    const niches = buildStrongestNiches7d([
      radar({ observed_at: "2026-08-01T18:00:00.000Z" }),
      radar({ product_term: "Rejeitado", normalized_product_term: "rejeitado", evidence_status: "rejected" }),
      radar({ product_term: "Sem prova", normalized_product_term: "sem prova", evidence_status: "unverified" }),
      radar({ product_term: "Válido", normalized_product_term: "valido", observed_at: "2026-08-10T18:00:00.000Z" }),
    ], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(niches).toHaveLength(1);
    expect(niches[0].productCount).toBe(1);
    expect(niches[0].topProducts[0].normalizedProductTerm).toBe("valido");
  });

  it("mede aceleração pela cadência observada, sem declarar volume de mercado", () => {
    const niches = buildStrongestNiches7d([
      radar({ product_term: "A", normalized_product_term: "a", observed_at: "2026-08-10T10:00:00.000Z" }),
      radar({ product_term: "B", normalized_product_term: "b", observed_at: "2026-08-09T10:00:00.000Z" }),
      radar({ product_term: "C", normalized_product_term: "c", observed_at: "2026-08-08T10:00:00.000Z" }),
      radar({ product_term: "D", normalized_product_term: "d", observed_at: "2026-08-04T10:00:00.000Z" }),
    ], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(niches[0].signalCadence).toEqual({
      recentObservationCount: 3,
      priorObservationCount: 1,
      acceleration: "rising",
    });
    expect(niches[0]).not.toHaveProperty("marketVolume");
  });

  it("expõe performance interna somente quando verificada e disponível", () => {
    const withoutInternal = buildStrongestNiches7d([radar()], { asOf: "2026-08-10T23:00:00.000Z" });
    const withInternal = buildStrongestNiches7d([radar()], {
      asOf: "2026-08-10T23:00:00.000Z",
      internalPerformanceByProduct: {
        "fone bluetooth": { verified: true, score: 12 },
      },
    });

    expect(withoutInternal[0].internalPerformance).toBeNull();
    expect(withInternal[0].internalPerformance).toEqual({ productCount: 1, averageScore: 12 });
  });

  it("calcula confiança determinística e desempata nichos por nome", () => {
    const a = radar({ category: "Áudio" });
    const b = radar({ category: "Casa", product_term: "Panela", normalized_product_term: "panela" });
    const first = buildStrongestNiches7d([b, a], { asOf: "2026-08-10T23:00:00.000Z" });
    const second = buildStrongestNiches7d([a, b], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(first.map((item) => item.niche)).toEqual(second.map((item) => item.niche));
    expect(first.every((item) => item.confidence >= 0 && item.confidence <= 100)).toBe(true);
  });
});
