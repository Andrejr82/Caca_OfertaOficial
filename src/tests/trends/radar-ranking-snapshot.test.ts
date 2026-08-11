import { describe, expect, it } from "vitest";
import type { DailyTrendRadarResult } from "@/core/trends/daily-radar";
import { buildExecutiveRadarRanking } from "@/core/trends/executive-radar-ranking";
import { toTrendRadarSnapshotProducts } from "@/lib/trends/radar-ranking-snapshot";

function radar(): DailyTrendRadarResult {
  return {
    radar_date: "2026-08-10",
    product_term: "Fone Bluetooth",
    normalized_product_term: "fone bluetooth",
    category: "Eletrônicos",
    marketplaces: ["Mercado Livre"],
    source_types: ["mercado_livre_best_seller", "google_trends"],
    source_urls: ["https://www.mercadolivre.com.br/a", "https://trends.google.com/a"],
    observed_at: "2026-08-10T18:00:00.000Z",
    rank_position: 3,
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
      claim: "Ranking oficial observado.",
      evidence_type: "mercado_livre_best_seller",
      source_url: "https://www.mercadolivre.com.br/a",
      observed_at: "2026-08-10T18:00:00.000Z",
      rank_position: 3,
      best_seller_flag: true,
      trending_flag: null,
      sold_quantity: null,
      price: 99,
      old_price: 109,
      discount_percent: 10,
      rating: 4.5,
      review_count: 10,
      shipping: "free_shipping",
      marketplace_identity: { item_id: "MLB123" },
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
    match_status: "matched",
    opportunity_id: "11111111-1111-1111-1111-111111111111",
  };
}

describe("Radar ranking snapshot mapping", () => {
  it("leva score, motivos, foco e vínculo de oportunidade para persistência", () => {
    const ranking = buildExecutiveRadarRanking([radar()], { asOf: "2026-08-10T23:00:00.000Z" });
    const [snapshot] = toTrendRadarSnapshotProducts(ranking);

    expect(snapshot).toMatchObject({
      priority: 1,
      productTerm: "Fone Bluetooth",
      normalizedProductTerm: "fone bluetooth",
      marketplace: "Mercado Livre",
      commercialScore: ranking[0].score.total,
      scoreBreakdown: ranking[0].score.breakdown,
      determiningReasons: ranking[0].determiningReasons,
      isFocus: true,
      matchStatus: "matched",
      opportunityId: "11111111-1111-1111-1111-111111111111",
    });
  });
});
