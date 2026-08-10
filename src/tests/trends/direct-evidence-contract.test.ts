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
});
