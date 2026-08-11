import { describe, expect, it } from "vitest";
import {
  buildDailyRadarFromTrendSignals,
  importExternalRadarJson,
  rankDailyTrendRadar,
  type DailyTrendRadarInput
} from "@/core/trends/daily-radar";

const goodParafusadeira: DailyTrendRadarInput = {
  radar_date: "2026-08-10",
  product_term: "Parafusadeira TB12A",
  normalized_product_term: "parafusadeira tb12a",
  category: "Ferramentas",
  marketplaces: ["Mercado Livre"],
  source_types: ["mercado_livre_official_api"],
  source_urls: ["https://www.mercadolivre.com.br/MLB123"],
  observed_at: "2026-08-10T12:00:00.000Z",
  rank_position: 3,
  best_seller_flag: true,
  trending_flag: null,
  campaign_flag: null,
  sold_quantity_observed: null,
  observed_price_min: 199,
  observed_price_max: 249,
  discount_percent: 20,
  rating: 4.8,
  shipping_signal: "free_shipping",
  direct_evidence: [{
    claim: "Produto observado no ranking oficial.",
    evidence_type: "marketplace_best_seller",
    source_url: "https://www.mercadolivre.com.br/MLB123",
    rank_position: 3,
    best_seller_flag: true,
    price: 199,
    old_price: 249,
    discount_percent: 20,
    rating: 4.8,
    shipping: "free_shipping",
    marketplace_identity: { item_id: "MLB123" }
  }],
  inferred_signals: ["facilidade de conversão"],
  source_count: 99,
  evidence_status: "unverified",
  confidence: 1,
  affiliate_potential: "low",
  visual_content_potential: "low",
  demand_reason: "fake",
  rank: 999,
  strategy_version: "external-fake",
  match_status: "pending",
  opportunity_id: "fake"
};

describe("DailyTrendRadarResult", () => {
  it("revalida fatos externos e ignora flags/score recebidos", () => {
    const [result] = importExternalRadarJson({ results: [goodParafusadeira] });

    expect(result).toMatchObject({
      evidence_status: "verified",
      source_count: 1,
      confidence: 100,
      affiliate_potential: "high",
      opportunity_id: null,
      match_status: "pending"
    });
    expect(result.rank).toBeNull();
  });

  it("aceita fatos estruturados e preserva os campos observados", () => {
    const [result] = importExternalRadarJson({ results: [{
      product_term: "Produto real",
      marketplace: "mercado_livre",
      source_urls: ["https://example.com/ranking"],
      observed_at: "2026-08-10T17:06:00-03:00",
      direct_evidence: [{
        source: "Ranking",
        fact: "Produto observado no ranking.",
        url: "https://example.com/ranking",
        rank_position: 5,
        best_seller_flag: true,
        price: 64.41,
        discount_percent: 20,
        rating: 4.7
      }],
      confidence: "alta",
      best_seller_flag: false,
      rank_position: 999,
      price_min: 1
    }] });

    expect(result).toMatchObject({
      evidence_status: "verified",
      source_count: 1,
      best_seller_flag: true,
      rank_position: 5,
      observed_price_min: 64.41,
      observed_price_max: 64.41,
      discount_percent: 20,
      rating: 4.7,
      marketplaces: ["mercado_livre"]
    });
  });

  it("bloqueia Market Baseline sem fonte atual", () => {
    const [result] = importExternalRadarJson({ results: [{
      product_term: "Creatina",
      source_count: 0,
      source_urls: [],
      observed_at: "2026-08-10T12:00:00.000Z",
      direct_evidence: ["Market Baseline"],
      inferred_signals: []
    }] });

    expect(result.evidence_status).toBe("unverified");
  });

  it("prioriza verified, depois partial, e exclui unverified do top", () => {
    const results = importExternalRadarJson({ results: [
      { ...goodParafusadeira, product_term: "Mop", direct_evidence: [{ claim: "produto observado", source_url: "https://example.com/mop" }], source_urls: ["https://example.com/mop"], rank_position: null, best_seller_flag: null, observed_price_min: null, observed_price_max: null, discount_percent: null, rating: null },
      { ...goodParafusadeira, product_term: "Power Bank 20.000 mAh", source_urls: ["https://shopee.com.br/power-bank"], direct_evidence: [{ claim: "Produto observado no ranking.", source_url: "https://shopee.com.br/power-bank", rank_position: 1, best_seller_flag: true }] },
      { product_term: "Creatina", source_count: 0, source_urls: [], observed_at: "2026-08-10T12:00:00.000Z", direct_evidence: ["Market Baseline"], inferred_signals: [] }
    ] });

    const ranked = rankDailyTrendRadar(results);
    expect(ranked.map((item) => item.evidence_status)).toEqual(["verified", "partial", "unverified"]);
    expect(ranked.at(-1)?.rank).toBeNull();
  });

  it("mantém sinal sem classificação fora do Top Radar", () => {
    const [result] = buildDailyRadarFromTrendSignals([{
      id: "signal-1", sourceType: "external", sourceName: "google_trends", source: "google_trends", region: "BR", externalId: "x", term: "simone tebet", title: "simone tebet", evidence: { link: "https://trends.google.com/trending/story/1" }, observedAt: "2026-08-10T12:00:00.000Z", capturedAt: "2026-08-10T12:00:00.000Z", trendStrength: 500, trendDirection: "rising", offerId: null, classification: null
    }], []);

    expect(result.evidence_status).toBe("unverified");
    expect(rankDailyTrendRadar([result])[0].rank).toBeNull();
  });

  it("usa a proveniência padrão do Mercado Livre no Radar", () => {
    const sourceUrl = "https://lista.mercadolivre.com.br/furadeira";
    const [result] = buildDailyRadarFromTrendSignals([{
      id: "ml-trend-1",
      sourceType: "external",
      sourceName: "mercado_livre_trends",
      source: "mercado_livre_trends",
      region: "BR",
      externalId: "MLB:furadeira",
      term: "furadeira",
      title: "furadeira",
      evidence: { rank: 1, trendBucket: "fastest_growing", url: sourceUrl, link: sourceUrl, siteId: "MLB" },
      observedAt: "2026-08-11T18:40:50.793Z",
      capturedAt: "2026-08-11T18:40:50.793Z",
      trendStrength: null,
      trendDirection: "rising",
      offerId: null,
      classification: {
        id: "classification-ml-1",
        signalId: "ml-trend-1",
        commercialRelevance: 95,
        isProductIntent: true,
        normalizedProductTerm: "furadeira",
        categoryHint: "Ferramentas",
        decision: "eligible",
        reason: "Produto identificado",
        aiModel: "model",
        strategyVersion: "trend-commercial-v1",
        classifiedAt: "2026-08-11T18:40:55.000Z"
      }
    }], []);

    expect(result).toMatchObject({
      evidence_status: "partial",
      source_count: 1,
      normalized_product_term: "furadeira"
    });
    expect(result.source_urls).toContain(sourceUrl);
  });

  it("lê evidência persistida do Radar externo e preserva match/opportunity", () => {
    const [result] = buildDailyRadarFromTrendSignals([{
      id: "radar-bella", sourceType: "external", sourceName: "external_radar", source: "external_radar", region: "BR", externalId: "bella", term: "Escova Secadora Britânia BELLA01", title: "Escova Secadora Britânia BELLA01", evidence: {
        source_urls: ["https://shopee.com.br/list/Escova-Secadora"],
        direct_evidence: [{
          claim: "Britânia BELLA01 observada na lista oficial.",
          source_url: "https://shopee.com.br/list/Escova-Secadora",
          rank_position: 2,
          best_seller_flag: true,
          price: 99.9
        }],
        evidence_status: "verified",
        category: "Beleza e cuidados capilares"
      }, observedAt: "2026-08-10T12:00:00.000Z", capturedAt: "2026-08-10T12:00:00.000Z", trendStrength: null, trendDirection: null, offerId: null, classification: {
        id: "classification-bella", signalId: "radar-bella", commercialRelevance: 90, isProductIntent: true, normalizedProductTerm: "escova secadora britania bella01", categoryHint: "Beleza e cuidados capilares", decision: "eligible", reason: "Produto identificado", aiModel: "model", strategyVersion: "trend-commercial-v1", classifiedAt: "2026-08-10T12:00:00.000Z"
      }
    }], [{
      id: "opportunity-bella", signalId: "radar-bella", classificationId: null, offerId: "offer-bella", marketplace: "Shopee", normalizedProductTerm: "escova secadora britania bella01", matchStatus: "matched", matchReason: "Identidade validada", matchConfidence: 100, currentPrice: 94.9, oldPrice: null, score: null, status: "matched", experimentId: "experiment-bella", strategyVersion: "daily-commercial-radar-v1", finalDecision: null, signalTitle: "Escova Secadora Britânia BELLA01", recommendation: null
    }]);

    expect(result).toMatchObject({
      evidence_status: "verified",
      marketplaces: ["Shopee"],
      match_status: "matched",
      opportunity_id: "opportunity-bella",
      observed_price_min: 99.9
    });
  });
});
