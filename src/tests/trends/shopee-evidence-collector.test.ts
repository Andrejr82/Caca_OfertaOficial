import { describe, expect, it } from "vitest";
import {
  collectShopeeProductOfferEvidence,
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
  priceDiscountRate: 14
};

describe("Shopee Evidence Collector", () => {
  it("normaliza produto oficial em evidência canônica sem inventar ranking ou tendência", () => {
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

  it("expõe observabilidade e não produz sinais quando a fonte oficial falha", async () => {
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

  it("coleta por uma única fonte oficial e preserva os contadores", async () => {
    const result = await collectShopeeProductOfferEvidence("air fryer", {
      now: () => new Date(observedAt),
      loadNodes: async () => [officialNode]
    });

    expect(result.status).toBe("ok");
    expect(result.received).toBe(1);
    expect(result.accepted).toBe(1);
    expect(result.rejected).toBe(0);
    expect(result.signals).toHaveLength(1);
  });
});
