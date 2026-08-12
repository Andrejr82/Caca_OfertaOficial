import { describe, expect, it } from "vitest";
import type { TrendOfferCandidate } from "@/core/trends/offer-matching";
import { mapRankedCandidatesToTrend } from "@/lib/trends/shopee-search-adapter";
import { processRawOffers } from "@/lib/shopee/ranking/search-service";
import type { ShopeeRankedCandidate } from "@/lib/shopee/ranking/types";
import {
  buildTrendShopeeApprovalRows,
  discoverTrendShopeeApprovalCandidates,
  persistTrendShopeeApprovalCandidates,
  rankTrendShopeeCandidates,
  type TrendRadarApprovalProduct,
} from "@/lib/trends/shopee-approval-queue";

function radar(id: string, priority: number, term: string): TrendRadarApprovalProduct {
  return { id, priority, product_term: term, category: "Eletrônicos", evidence_status: "partial", commercial_score: 40, confidence: 60 };
}

function candidate(id: string, title: string, scoreSeed = 0): TrendOfferCandidate {
  const affiliateUrl = `https://s.shopee.com.br/${id}`;
  return {
    id,
    marketplace: "Shopee",
    productName: title,
    currentPrice: 99 + scoreSeed,
    oldPrice: null,
    itemId: id,
    shopeeItemId: id,
    permalink: affiliateUrl,
    marketplaceMetrics: {
      shopId: `8${id}`,
      imageUrl: `https://cf.shopee.com.br/${id}.jpg`,
      affiliateUrl,
      rating: 4.8,
      sales: 1000 + scoreSeed,
      discount: 20,
      commissionRate: 0.08,
    },
  };
}

describe("Shopee approval queue", () => {
  it("preserva imagem e reflete o preço antigo a partir de priceMax quando disponível", () => {
    const processed = processRawOffers([{
      itemId: "123",
      shopId: "456",
      productName: "Carregador Portatil 20000mAh",
      productLink: "https://shopee.com.br/product/456/123",
      offerLink: "https://s.shopee.com.br/123",
      imageUrl: "https://cf.shopee.com.br/123.jpg",
      priceMin: 89.90,
      priceMax: 129.90,
      ratingStar: 4.9,
      sales: 1200,
      commissionRate: 5
    }], { scenarioId: "test", categoryKey: "geral" }, "Carregador Portatil", new Date().toISOString());

    const validCandidates = processed.filter(p => p.isValid).map(p => p.candidate as ShopeeRankedCandidate);
    const [mapped] = mapRankedCandidatesToTrend(validCandidates);
    
    expect(mapped.oldPrice).toBe(129.9);
    expect(mapped.marketplaceMetrics?.imageUrl).toBe("https://cf.shopee.com.br/123.jpg");
    expect(mapped.marketplaceMetrics?.affiliateUrl).toBe("https://s.shopee.com.br/123");
    expect(mapped.marketplaceMetrics?.priceMax).toBe(129.9);
  });

  it("bloqueia termos regulados e pesquisa apenas tendências elegíveis", async () => {
    const calls: string[] = [];
    const result = await discoverTrendShopeeApprovalCandidates([
      radar("unsafe", 1, "airsoft"),
      radar("safe", 2, "carregador portatil"),
    ], {
      search: async (query) => {
        calls.push(query);
        return [candidate("123", "Carregador Portatil 20000mAh")];
      },
    });
    expect(calls).toEqual(["carregador portatil"]);
    expect(result.rejectedRadarProducts[0]).toMatchObject({ radarProductId: "unsafe", reason: "regulated_weapon" });
    expect(result.candidates).toHaveLength(1);
  });

  it("rejeita identidade técnica incompleta, link não afiliado e produto sem aderência ao termo", () => {
    const input = radar("samsung", 1, "celular samsung");
    const invalidIdentity = { ...candidate("111", "Samsung Galaxy A55"), marketplaceMetrics: { imageUrl: "https://cf.shopee.com.br/111.jpg" } };
    const wrongProduct = candidate("222", "Apple iPhone 15 Pro Max");
    const nonAffiliate = { ...candidate("444", "Samsung Galaxy A55 5G Smartphone"), marketplaceMetrics: { ...candidate("444", "Samsung Galaxy A55 5G Smartphone").marketplaceMetrics, affiliateUrl: null } };
    const valid = candidate("333", "Samsung Galaxy A55 5G Smartphone");
    const ranked = rankTrendShopeeCandidates(input, [invalidIdentity, wrongProduct, nonAffiliate, valid]);
    expect(ranked.map((item) => item.itemId)).toEqual(["333"]);
  });

  it("não confunde acessórios ou wearables Samsung com celulares Samsung", () => {
    const input = radar("samsung", 1, "celular samsung");
    const ranked = rankTrendShopeeCandidates(input, [
      candidate("501", "Kit 2 em1 Película Vidro 3D + Capa Capinha Transparente Para Samsung Galaxy A55"),
      candidate("502", "Suporte Celular Tablet Universal Ajustável Compatível com Samsung"),
      candidate("504", "Samsung Smartwatch Galaxy Fit3 Grafite"),
      candidate("503", "Samsung Galaxy A55 5G Smartphone 128GB"),
    ]);
    expect(ranked.map((item) => item.itemId)).toEqual(["503"]);
  });

  it("limita a três candidatos por tendência e ordena por score comercial", () => {
    const input = radar("charger", 1, "carregador portatil");
    const ranked = rankTrendShopeeCandidates(input, [
      candidate("101", "Carregador Portatil 10000mAh", 0),
      candidate("102", "Carregador Portatil 20000mAh", 10),
      candidate("103", "Carregador Portatil 30000mAh", 20),
      candidate("104", "Carregador Portatil 40000mAh", 30),
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });

  it("normaliza score persistido para 0-10 e preserva ranking completo na explicabilidade", () => {
    const selected = rankTrendShopeeCandidates(radar("charger", 1, "carregador portatil"), [candidate("123", "Carregador Portatil 20000mAh")]);
    const rows = buildTrendShopeeApprovalRows("user-1", "run-1", selected);
    expect(selected[0].score).toBeGreaterThan(10);
    expect(rows[0].score).toBeGreaterThanOrEqual(0);
    expect(rows[0].score).toBeLessThanOrEqual(10);
    expect(rows[0].score).toBe(Number((selected[0].score / 10).toFixed(2)));
    expect(rows[0].explainability.ranking_score).toBe(selected[0].score);
  });

  it("materializa somente pending_manual_review e mantém publicação automática desligada", async () => {
    const selected = rankTrendShopeeCandidates(radar("charger", 1, "carregador portatil"), [candidate("123", "Carregador Portatil 20000mAh")]);
    const rows = buildTrendShopeeApprovalRows("user-1", "run-1", selected);
    expect(rows[0].status).toBe("pending_manual_review");
    expect(rows[0].explainability.provenance).toBe("trend_executive");
    expect(rows[0].explainability.automatic_publication).toBe(false);

    const rpcCalls: unknown[] = [];
    const client = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return { data: { inserted: 1, updated: 1, failed: 0, offer_ids: ["offer-ready", "offer-selected"] }, error: null };
      },
      from: () => ({
        select() { return this; },
        async in() {
          return { data: [{ id: "offer-ready", status: "pending_manual_review" }, { id: "offer-selected", status: "selected" }], error: null };
        },
      }),
    };
    const persisted = await persistTrendShopeeApprovalCandidates(client, "user-1", "run-1", selected);
    expect(rpcCalls).toHaveLength(1);
    expect((rpcCalls[0] as { name: string }).name).toBe("upsert_discovery_offers_v2");
    expect(persisted.readyOfferIds).toEqual(["offer-ready"]);
  });
});