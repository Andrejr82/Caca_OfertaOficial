import { describe, expect, it } from "vitest";
import type { DailyTrendRadarResult } from "@/core/trends/daily-radar";
import {
  calculateCommercialOpportunityScoreV2,
  rankCommercialOpportunitiesV2,
} from "@/core/trends/commercial-opportunity-score-v2";

function radar(overrides: Partial<DailyTrendRadarResult> = {}): DailyTrendRadarResult {
  return {
    radar_date: "2026-08-10",
    product_term: "Fone Bluetooth",
    normalized_product_term: "fone bluetooth",
    category: "Eletrônicos",
    marketplaces: ["Mercado Livre"],
    source_types: ["google_trends", "mercado_livre_trends", "mercado_livre_best_seller"],
    source_urls: ["https://trends.google.com/a", "https://www.mercadolivre.com.br/b", "https://www.mercadolivre.com.br/c"],
    observed_at: "2026-08-10T18:00:00.000Z",
    rank_position: 3,
    best_seller_flag: true,
    trending_flag: true,
    campaign_flag: null,
    sold_quantity_observed: 500,
    observed_price_min: 99.9,
    observed_price_max: 119.9,
    discount_percent: 20,
    rating: 4.8,
    shipping_signal: "free_shipping",
    direct_evidence: [
      {
        claim: "Produto no ranking oficial.",
        evidence_type: "mercado_livre_best_seller",
        source_url: "https://www.mercadolivre.com.br/c",
        observed_at: "2026-08-10T18:00:00.000Z",
        rank_position: 3,
        best_seller_flag: true,
        trending_flag: null,
        sold_quantity: 500,
        price: 99.9,
        old_price: 124.9,
        discount_percent: 20,
        rating: 4.8,
        review_count: 300,
        shipping: "free_shipping",
        marketplace_identity: { item_id: "MLB123" },
      },
    ],
    inferred_signals: [],
    source_count: 3,
    evidence_status: "verified",
    confidence: 100,
    affiliate_potential: "high",
    visual_content_potential: "medium",
    demand_reason: "Sinais convergentes.",
    rank: null,
    strategy_version: "daily-commercial-radar-v1",
    match_status: "pending",
    opportunity_id: null,
    ...overrides,
  };
}

describe("Commercial Opportunity Score V2", () => {
  it("respeita pesos máximos 30/20/20/15/10/5", () => {
    const result = calculateCommercialOpportunityScoreV2(radar(), {
      internalPerformance: { verified: true, score: 15 },
      asOf: "2026-08-10T23:00:00.000Z",
    });

    expect(result.breakdown).toEqual({
      evidenceQuality: 30,
      sourceConvergence: 20,
      marketplaceDemand: 20,
      internalPerformance: 15,
      commercialAttractiveness: 10,
      recency: 5,
    });
    expect(result.total).toBe(100);
  });

  it("usa zero para performance interna ausente ou não verificada", () => {
    expect(calculateCommercialOpportunityScoreV2(radar()).breakdown.internalPerformance).toBe(0);
    expect(calculateCommercialOpportunityScoreV2(radar(), {
      internalPerformance: { verified: false, score: 15 },
    }).breakdown.internalPerformance).toBe(0);
  });

  it("não deixa evidência unverified ou rejected competir com evidência comercial forte", () => {
    const strong = calculateCommercialOpportunityScoreV2(radar()).total;
    const unverified = calculateCommercialOpportunityScoreV2(radar({ evidence_status: "unverified" })).total;
    const rejected = calculateCommercialOpportunityScoreV2(radar({ evidence_status: "rejected" })).total;

    expect(strong).toBeGreaterThan(0);
    expect(unverified).toBe(0);
    expect(rejected).toBe(0);
  });

  it("não trata Google Trends isolado como demanda explícita de marketplace", () => {
    const result = calculateCommercialOpportunityScoreV2(radar({
      marketplaces: [],
      source_types: ["google_trends"],
      source_urls: ["https://trends.google.com/a"],
      source_count: 1,
      rank_position: null,
      best_seller_flag: null,
      sold_quantity_observed: null,
      direct_evidence: [{
        claim: "Termo em alta.",
        evidence_type: "google_trends",
        source_url: "https://trends.google.com/a",
        observed_at: "2026-08-10T18:00:00.000Z",
        rank_position: null,
        best_seller_flag: null,
        trending_flag: true,
        sold_quantity: null,
        price: null,
        old_price: null,
        discount_percent: null,
        rating: null,
        review_count: null,
        shipping: null,
        marketplace_identity: {},
      }],
    }));

    expect(result.breakdown.marketplaceDemand).toBe(0);
  });

  it("calcula recência sem depender do relógio do processo", () => {
    const recent = calculateCommercialOpportunityScoreV2(radar(), { asOf: "2026-08-10T23:00:00.000Z" });
    const old = calculateCommercialOpportunityScoreV2(radar(), { asOf: "2026-08-25T23:00:00.000Z" });

    expect(recent.breakdown.recency).toBe(5);
    expect(old.breakdown.recency).toBe(0);
    expect(calculateCommercialOpportunityScoreV2(radar(), { asOf: "2026-08-10T23:00:00.000Z" })).toEqual(recent);
  });

  it("desempata ranking deterministicamente por identidade normalizada", () => {
    const a = radar({ product_term: "Mouse", normalized_product_term: "mouse" });
    const b = radar({ product_term: "Teclado", normalized_product_term: "teclado" });
    const ranked = rankCommercialOpportunitiesV2([b, a], { asOf: "2026-08-10T23:00:00.000Z" });

    expect(ranked.map((item) => item.result.normalized_product_term)).toEqual(["mouse", "teclado"]);
  });
});
