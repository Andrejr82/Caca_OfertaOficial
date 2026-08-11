import { describe, expect, it } from "vitest";
import type { DailyTrendRadarResult } from "@/core/trends/daily-radar";
import { buildExecutiveRadarRanking } from "@/core/trends/executive-radar-ranking";

function radar(term: string, scoreShape: Partial<DailyTrendRadarResult> = {}): DailyTrendRadarResult {
  return {
    radar_date: "2026-08-10",
    product_term: term,
    normalized_product_term: term.toLocaleLowerCase("pt-BR"),
    category: "Eletrônicos",
    marketplaces: ["Mercado Livre"],
    source_types: ["mercado_livre_best_seller", "google_trends"],
    source_urls: ["https://www.mercadolivre.com.br/a", "https://trends.google.com/a"],
    observed_at: "2026-08-10T18:00:00.000Z",
    rank_position: 5,
    best_seller_flag: true,
    trending_flag: null,
    campaign_flag: null,
    sold_quantity_observed: null,
    observed_price_min: 99,
    observed_price_max: 99,
    discount_percent: 10,
    rating: 4.5,
    shipping_signal: "free_shipping",
    direct_evidence: [{
      claim: "Produto em ranking oficial.",
      evidence_type: "mercado_livre_best_seller",
      source_url: "https://www.mercadolivre.com.br/a",
      observed_at: "2026-08-10T18:00:00.000Z",
      rank_position: 5,
      best_seller_flag: true,
      trending_flag: null,
      sold_quantity: null,
      price: 99,
      old_price: 109,
      discount_percent: 10,
      rating: 4.5,
      review_count: 10,
      shipping: "free_shipping",
      marketplace_identity: { item_id: `id-${term}` },
    }],
    inferred_signals: [],
    source_count: 2,
    evidence_status: "verified",
    confidence: 100,
    affiliate_potential: "high",
    visual_content_potential: "medium",
    demand_reason: "Ranking oficial observado.",
    rank: null,
    strategy_version: "daily-commercial-radar-v1",
    match_status: "pending",
    opportunity_id: null,
    ...scoreShape,
  };
}

describe("Executive Radar Top 20 / Top 3", () => {
  it("limita o ranking a 20 produtos e marca apenas os 3 primeiros como foco", () => {
    const input = Array.from({ length: 25 }, (_, index) => radar(`Produto ${String(index + 1).padStart(2, "0")}`));
    const ranking = buildExecutiveRadarRanking(input, { asOf: "2026-08-10T23:00:00.000Z" });

    expect(ranking).toHaveLength(20);
    expect(ranking.map((item) => item.priority)).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(ranking.filter((item) => item.isFocus).map((item) => item.priority)).toEqual([1, 2, 3]);
  });

  it("persiste breakdown auditável e separa evidência de recomendação nos motivos", () => {
    const [item] = buildExecutiveRadarRanking([radar("Fone")], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(item.score.total).toBeGreaterThan(0);
    expect(item.score.breakdown).toMatchObject({ evidenceQuality: 30 });
    expect(item.determiningReasons.some((reason) => reason.startsWith("Evidência:"))).toBe(true);
    expect(item.determiningReasons.some((reason) => reason.startsWith("Recomendação:"))).toBe(true);
  });

  it("aplica performance interna verificada pelo produto normalizado", () => {
    const baseline = buildExecutiveRadarRanking([radar("Câmera Wi-Fi")], {
      asOf: "2026-08-10T23:00:00.000Z",
    })[0];
    const withInternal = buildExecutiveRadarRanking([radar("Câmera Wi-Fi")], {
      asOf: "2026-08-10T23:00:00.000Z",
      internalPerformanceByProduct: { "camera wi fi": { verified: true, score: 10 } },
    })[0];

    expect(withInternal.score.breakdown.internalPerformance).toBe(10);
    expect(withInternal.score.total - baseline.score.total).toBe(10);
  });

  it("exclui evidência rejected/unverified do Top 20 operacional", () => {
    const ranking = buildExecutiveRadarRanking([
      radar("Verificado"),
      radar("Rejeitado", { evidence_status: "rejected" }),
      radar("Sem prova", { evidence_status: "unverified" }),
    ], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(ranking.map((item) => item.result.product_term)).toEqual(["Verificado"]);
  });

  it("preserva vínculo com oportunidade quando existente", () => {
    const [item] = buildExecutiveRadarRanking([
      radar("Mouse", { opportunity_id: "11111111-1111-1111-1111-111111111111" }),
    ], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(item.result.opportunity_id).toBe("11111111-1111-1111-1111-111111111111");
  });
});
