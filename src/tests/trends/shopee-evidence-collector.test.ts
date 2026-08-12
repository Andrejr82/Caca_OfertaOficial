import { describe, expect, it } from "vitest";
import {
  collectShopeeCampaignEvidence,
  collectShopeeProductOfferEvidence,
  normalizeShopeeCampaignEvidence,
  normalizeShopeeProductOfferEvidence
} from "@/lib/trends/shopee-evidence-collector";

const observedAt = "2026-08-10T23:30:00.000Z";

const officialNode = {
  itemId: "456",
  shopId: "123",
  shopName: "Loja Oficial",
  productName: "Air Fryer 5L",
  productLink: "https://shopee.com.br/product/123/456",
  offerLink: "https://shope.ee/example",
  priceMin: 299.9,
  priceMax: 349.9,
  ratingStar: 4.8,
  sales: 321,
  priceDiscountRate: 14,
  commissionRate: 5
};

describe("Shopee Evidence Collector", () => {
  it("normaliza produto oficial em evidência canônica sem inventar ranking, tendência ou preço antigo", () => {
    const result = normalizeShopeeProductOfferEvidence([officialNode], {
      query: "air fryer",
      observedAt,
      capturedAt: observedAt
    });

    expect(result).toMatchObject({
      source: "shopee_product_offer",
      status: "ok",
      received: 1,
      accepted: 1,
      rejected: 0
    });
    expect(result.signals).toHaveLength(1);
    expect(result.signals[0]).toMatchObject({
      sourceType: "external",
      sourceName: "shopee_product_offer",
      source: "shopee_product_offer",
      region: "BR",
      externalId: "shopee:123:456",
      term: "air fryer",
      title: "Air Fryer 5L",
      observedAt,
      capturedAt: observedAt,
      trendStrength: null,
      trendDirection: null,
      offerId: null
    });

    const directEvidence = result.signals[0].evidence.direct_evidence?.[0];
    expect(directEvidence).toMatchObject({
      evidence_type: "shopee_product_offer",
      source_url: "https://shopee.com.br/product/123/456",
      observed_at: observedAt,
      rank_position: null,
      best_seller_flag: null,
      trending_flag: null,
      sold_quantity: 321,
      price: 299.9,
      old_price: 349.9,
      discount_percent: 14,
      rating: 4.8,
      review_count: null,
      shipping: null,
      marketplace_identity: {
        marketplace: "shopee",
        shop_id: "123",
        item_id: "456"
      }
    });
  });

  it("mantém métricas opcionais ausentes como null, desde que cumpra os filtros mínimos comerciais", () => {
    const result = normalizeShopeeProductOfferEvidence([{
      itemId: "789",
      shopId: "321",
      productName: "Organizador de mesa",
      productLink: "https://shopee.com.br/product/321/789",
      offerLink: "https://shope.ee/organizador",
      priceMin: 49.9,
      sales: 15, // required
      ratingStar: 4.6, // required
      commissionRate: 5 // required
      // missing: priceMax, priceDiscountRate, shopName
    }], { query: "organizador", observedAt, capturedAt: observedAt });

    expect(result.signals[0].evidence.direct_evidence?.[0]).toMatchObject({
      old_price: null,
      discount_percent: 0,
      review_count: null,
      shipping: null
    });
    
    expect(result.signals[0].evidence).toMatchObject({
      shop_name: null
    });
  });

  it("falha fechado para produto sem identidade nativa completa", () => {
    const result = normalizeShopeeProductOfferEvidence([{ ...officialNode, shopId: null }], {
      query: "air fryer",
      observedAt,
      capturedAt: observedAt
    });

    expect(result.status).toBe("empty");
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.signals).toEqual([]);
  });

  it("falha fechado para produto sem URL oficial verificável", () => {
    const result = normalizeShopeeProductOfferEvidence([{ ...officialNode, productLink: null, offerLink: "javascript:alert(1)" }], {
      query: "air fryer",
      observedAt,
      capturedAt: observedAt
    });

    expect(result.status).toBe("empty");
    expect(result.accepted).toBe(0);
    expect(result.rejected).toBe(1);
    expect(result.signals).toEqual([]);
  });

  it("falha fechado para horário de observação inválido", () => {
    const result = normalizeShopeeProductOfferEvidence([officialNode], {
      query: "air fryer",
      observedAt: "horario-invalido",
      capturedAt: observedAt
    });

    expect(result.status).toBe("failed");
    expect(result.signals).toEqual([]);
    expect(result.errorCode).toBe("invalid_observed_at");
  });

  it("normaliza campanha oficial sem tratá-la como produto, ranking ou tendência", () => {
    const result = normalizeShopeeCampaignEvidence([{
      offerName: "Festival de Ofertas",
      offerLink: "https://shope.ee/campaign",
      imageUrl: "https://cf.shopee.com.br/campaign.jpg",
      commissionRate: 0.08
    }], { observedAt, capturedAt: observedAt });

    expect(result).toMatchObject({ source: "shopee_campaign", status: "ok", accepted: 1 });
    expect(result.signals[0]).toMatchObject({
      sourceName: "shopee_campaign",
      source: "shopee_campaign",
      term: "Festival de Ofertas",
      title: "Festival de Ofertas",
      trendStrength: null,
      trendDirection: null
    });
    expect(result.signals[0].evidence.direct_evidence?.[0]).toMatchObject({
      evidence_type: "shopee_campaign",
      source_url: "https://shope.ee/campaign",
      observed_at: observedAt,
      rank_position: null,
      best_seller_flag: null,
      trending_flag: null,
      price: null,
      discount_percent: null,
      rating: null,
      marketplace_identity: { marketplace: "shopee" }
    });
    expect(result.signals[0].evidence.campaign_flag).toBe(true);
  });

  it("expõe observabilidade e não produz sinais quando a fonte oficial de produtos falha", async () => {
    const result = await collectShopeeProductOfferEvidence("air fryer", {
      now: () => new Date(observedAt),
      loadNodes: async () => {
        throw new Error("HTTP 503");
      }
    });

    expect(result).toMatchObject({
      source: "shopee_product_offer",
      status: "failed",
      received: 0,
      accepted: 0,
      rejected: 0,
      errorCode: "source_unavailable",
      signals: []
    });
  });

  it("coleta produto e campanha por fontes oficiais separadas", async () => {
    const product = await collectShopeeProductOfferEvidence("air fryer", {
      now: () => new Date(observedAt),
      loadNodes: async () => [officialNode]
    });
    const campaign = await collectShopeeCampaignEvidence({
      now: () => new Date(observedAt),
      loadNodes: async () => [{ offerName: "Festival de Ofertas", offerLink: "https://shope.ee/campaign" }]
    });

    expect(product).toMatchObject({ status: "ok", received: 1, accepted: 1, rejected: 0 });
    expect(campaign).toMatchObject({ status: "ok", received: 1, accepted: 1, rejected: 0 });
  });
});
