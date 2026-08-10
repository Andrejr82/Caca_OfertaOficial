import { describe, expect, it } from "vitest";
import { importExternalRadarJson } from "@/core/trends/daily-radar";

describe("direct evidence contract", () => {
  it("does not promote free text claims into structured commercial facts", () => {
    const [result] = importExternalRadarJson({
      results: [{
        product_term: "Produto observado",
        marketplace: "mercado_livre",
        source_urls: ["https://example.com/ranking"],
        observed_at: "2026-08-10T17:06:00-03:00",
        direct_evidence: [{
          source: "Ranking",
          fact: "Produto na posição 5º MAIS VENDIDO por R$64,41, rating 4,7 e 20% OFF.",
          url: "https://example.com/ranking"
        }]
      }]
    });

    expect(result.rank_position).toBeNull();
    expect(result.best_seller_flag).toBeNull();
    expect(result.observed_price_min).toBeNull();
    expect(result.observed_price_max).toBeNull();
    expect(result.discount_percent).toBeNull();
    expect(result.rating).toBeNull();
    expect(result.evidence_status).toBe("partial");
  });

  it("accepts explicit structured facts with valid provenance", () => {
    const [result] = importExternalRadarJson({
      results: [{
        product_term: "Produto comprovado",
        marketplace: "mercado_livre",
        direct_evidence: [{
          claim: "Produto observado no ranking oficial.",
          evidence_type: "marketplace_best_seller",
          source_url: "https://example.com/ranking",
          observed_at: "2026-08-10T17:06:00-03:00",
          rank_position: 5,
          best_seller_flag: true,
          sold_quantity: 120,
          price: 64.41,
          old_price: 80.51,
          discount_percent: 20,
          rating: 4.7,
          review_count: 321,
          shipping: "free_shipping",
          marketplace_identity: { item_id: "MLB123" }
        }]
      }]
    });

    expect(result).toMatchObject({
      evidence_status: "verified",
      source_count: 1,
      rank_position: 5,
      best_seller_flag: true,
      sold_quantity_observed: 120,
      observed_price_min: 64.41,
      observed_price_max: 64.41,
      discount_percent: 20,
      rating: 4.7,
      shipping_signal: "free_shipping"
    });
    expect(result.direct_evidence[0]).toMatchObject({
      evidence_type: "marketplace_best_seller",
      source_url: "https://example.com/ranking",
      marketplace_identity: { item_id: "MLB123" }
    });
  });

  it("rejects evidence with invalid provenance instead of trusting its facts", () => {
    const [result] = importExternalRadarJson({
      results: [{
        product_term: "Produto inválido",
        marketplace: "mercado_livre",
        observed_at: "2026-08-10T17:06:00-03:00",
        direct_evidence: [{
          claim: "Rank informado por payload externo.",
          source_url: "not-a-url",
          rank_position: 1,
          best_seller_flag: true
        }]
      }]
    });

    expect(result.evidence_status).toBe("rejected");
  });

  it("keeps absent commercial facts as null", () => {
    const [result] = importExternalRadarJson({
      results: [{
        product_term: "Produto apenas observado",
        marketplace: "mercado_livre",
        source_urls: ["https://example.com/product"],
        observed_at: "2026-08-10T17:06:00-03:00",
        direct_evidence: [{ claim: "Produto observado.", source_url: "https://example.com/product" }]
      }]
    });

    expect(result).toMatchObject({
      evidence_status: "partial",
      rank_position: null,
      best_seller_flag: null,
      sold_quantity_observed: null,
      observed_price_min: null,
      observed_price_max: null,
      discount_percent: null,
      rating: null,
      shipping_signal: null
    });
  });
});
