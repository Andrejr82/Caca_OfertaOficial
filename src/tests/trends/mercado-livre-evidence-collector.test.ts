import { describe, expect, it } from "vitest";
import {
  collectMercadoLivreBestSellerEvidence,
  normalizeMercadoLivreBestSellerEvidence
} from "@/lib/trends/mercado-livre-evidence-collector";

const observedAt = "2026-08-11T00:15:00.000Z";
const categoryId = "MLB432825";

const highlightsPayload = {
  query_data: { highlight_type: "BEST_SELLER", criteria: "CATEGORY", id: categoryId },
  content: [
    { id: "MLB1234567890", position: 1, type: "ITEM" },
    { id: "MLB61695785", position: 2, type: "PRODUCT" }
  ]
};

describe("Mercado Livre Evidence Collector", () => {
  it("separa prova de BEST_SELLER da evidência comercial do item", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence(highlightsPayload, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async (entry) => entry.type === "ITEM" ? {
        id: entry.id,
        title: "Air Fryer 5L",
        permalink: "https://produto.mercadolivre.com.br/MLB-1234567890-air-fryer-5l-_JM",
        price: 299.9,
        original_price: 349.9,
        sold_quantity: 450,
        category_id: categoryId,
        shipping: { free_shipping: true }
      } : {
        entity: {
          id: entry.id,
          name: "Smart TV 50",
          permalink: "https://www.mercadolivre.com.br/p/MLB61695785"
        },
        offer: {
          item_id: "MLB999999999",
          price: 2199,
          original_price: 2499,
          shipping: { free_shipping: true }
        }
      }
    });

    expect(result).toMatchObject({ source: "mercado_livre_best_seller", status: "ok", received: 2, accepted: 2, rejected: 0 });
    expect(result.signals).toHaveLength(2);

    const itemSignal = result.signals[0];
    expect(itemSignal).toMatchObject({
      sourceType: "external",
      sourceName: "mercado_livre_best_seller",
      source: "mercado_livre_best_seller",
      region: "BR",
      externalId: `MLB:${categoryId}:ITEM:MLB1234567890`,
      term: "Air Fryer 5L",
      title: "Air Fryer 5L",
      observedAt,
      capturedAt: observedAt,
      trendStrength: null,
      trendDirection: null,
      offerId: null
    });

    const evidence = itemSignal.evidence.direct_evidence ?? [];
    expect(evidence).toHaveLength(2);
    expect(evidence[0]).toMatchObject({
      evidence_type: "mercado_livre_best_seller",
      source_url: `https://api.mercadolibre.com/highlights/MLB/category/${categoryId}`,
      observed_at: observedAt,
      rank_position: 1,
      best_seller_flag: true,
      trending_flag: null,
      sold_quantity: null,
      price: null,
      old_price: null,
      discount_percent: null,
      rating: null,
      shipping: null,
      marketplace_identity: {
        marketplace: "mercado_livre",
        entity_type: "ITEM",
        item_id: "MLB1234567890",
        product_id: null,
        category_id: categoryId
      }
    });
    expect(evidence[1]).toMatchObject({
      evidence_type: "mercado_livre_offer",
      source_url: "https://api.mercadolibre.com/items?ids=MLB1234567890",
      observed_at: observedAt,
      rank_position: null,
      best_seller_flag: null,
      sold_quantity: 450,
      price: 299.9,
      old_price: 349.9,
      discount_percent: null,
      rating: null,
      shipping: "free_shipping"
    });
  });

  it("enriquece PRODUCT com oferta oficial sem atribuir preço ao catálogo", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence({
      ...highlightsPayload,
      content: [{ id: "MLB61695785", position: 2, type: "PRODUCT" }]
    }, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async () => ({
        entity: {
          id: "MLB61695785",
          name: "Smart TV 50",
          permalink: "https://www.mercadolivre.com.br/p/MLB61695785"
        },
        offer: {
          item_id: "MLB999999999",
          price: 2199,
          original_price: 2499,
          shipping: { free_shipping: true }
        }
      })
    });

    expect(result.signals).toHaveLength(1);
    const evidence = result.signals[0].evidence.direct_evidence ?? [];
    expect(evidence).toHaveLength(3);
    expect(evidence[1]).toMatchObject({
      evidence_type: "mercado_livre_product_evidence",
      source_url: "https://api.mercadolibre.com/products/MLB61695785",
      price: null,
      old_price: null,
      sold_quantity: null,
      marketplace_identity: {
        marketplace: "mercado_livre",
        entity_type: "PRODUCT",
        item_id: null,
        product_id: "MLB61695785",
        category_id: categoryId
      }
    });
    expect(evidence[2]).toMatchObject({
      evidence_type: "mercado_livre_offer",
      source_url: "https://api.mercadolibre.com/products/MLB61695785/items?limit=20",
      price: 2199,
      old_price: 2499,
      shipping: "free_shipping",
      marketplace_identity: {
        marketplace: "mercado_livre",
        entity_type: "ITEM",
        item_id: "MLB999999999",
        product_id: "MLB61695785",
        category_id: categoryId
      }
    });
  });

  it("mantém PRODUCT legível quando a API não expõe oferta com preço", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence({
      ...highlightsPayload,
      content: [{ id: "MLB61695785", position: 2, type: "PRODUCT" }]
    }, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async () => ({
        entity: {
          id: "MLB61695785",
          name: "Smart TV 50",
          permalink: "https://www.mercadolivre.com.br/p/MLB61695785"
        },
        offer: null
      })
    });

    expect(result.signals).toHaveLength(1);
    expect(result.signals[0].evidence.direct_evidence).toHaveLength(2);
    expect(result.signals[0].evidence.direct_evidence?.[1]).toMatchObject({
      evidence_type: "mercado_livre_product_evidence",
      price: null,
      old_price: null,
      sold_quantity: null
    });
  });

  it("rejeita payload que não declara BEST_SELLER oficialmente", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence({
      query_data: { highlight_type: "TRENDING", criteria: "CATEGORY", id: categoryId },
      content: [{ id: "MLB1234567890", position: 1, type: "ITEM" }]
    }, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async () => ({})
    });

    expect(result).toMatchObject({ status: "failed", errorCode: "invalid_highlight_contract", signals: [] });
  });

  it("rejeita posição fora do Top 20 e tipos sem enriquecimento homologado", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence({
      ...highlightsPayload,
      content: [
        { id: "MLB1", position: 21, type: "ITEM" },
        { id: "MLBU3013800008", position: 3, type: "USER_PRODUCT" }
      ]
    }, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async () => ({})
    });

    expect(result).toMatchObject({ status: "empty", received: 2, accepted: 0, rejected: 2, signals: [] });
  });

  it("falha fechado quando a entidade oficial não fornece título", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence({
      ...highlightsPayload,
      content: [{ id: "MLB1234567890", position: 1, type: "ITEM" }]
    }, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async () => ({ id: "MLB1234567890", price: 299.9 })
    });

    expect(result).toMatchObject({ status: "empty", accepted: 0, rejected: 1, signals: [] });
  });

  it("não transforma título em prova de best seller", async () => {
    const result = await normalizeMercadoLivreBestSellerEvidence({
      query_data: { highlight_type: "BEST_SELLER", criteria: "CATEGORY", id: categoryId },
      content: []
    }, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: async () => ({ title: "Mais vendido Air Fryer", price: 199 })
    });

    expect(result.signals).toEqual([]);
  });

  it("expõe observabilidade sanitizada quando /highlights falha", async () => {
    const result = await collectMercadoLivreBestSellerEvidence(categoryId, "token-secreto", {
      now: () => new Date(observedAt),
      loadHighlights: async () => { throw new Error("HTTP 503 token-secreto"); },
      loadEntity: async () => ({})
    });

    expect(result).toMatchObject({
      source: "mercado_livre_best_seller",
      status: "failed",
      received: 0,
      accepted: 0,
      rejected: 0,
      errorCode: "source_unavailable",
      signals: []
    });
    expect(JSON.stringify(result)).not.toContain("token-secreto");
  });
});
