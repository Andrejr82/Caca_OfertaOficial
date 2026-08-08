import { describe, it, expect } from "vitest";
import { deduplicateCommercialOffers, getCommercialProductIdentity, getMarketplaceCatalogKey, selectCatalogWinner } from "../../../lib/offers/catalog-grouping";
import type { Offer } from "@/types/domain";

describe("catalog-grouping", () => {
  describe("getMarketplaceCatalogKey", () => {
    it("deve agrupar ofertas do ML com mesma URL de catálogo /p/MLB...", () => {
      const offer1 = { id: "1", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/MLB34722310?query=123" } as Offer;
      const offer2 = { id: "2", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/mlb34722310#test" } as Offer;

      const key1 = getMarketplaceCatalogKey(offer1);
      const key2 = getMarketplaceCatalogKey(offer2);

      expect(key1).toBe("mercado-livre:catalog:MLB34722310");
      expect(key1).toBe(key2);
    });

    it("nao deve agrupar ML com catalog_id diferentes", () => {
      const offer1 = { id: "1", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/MLB1111" } as Offer;
      const offer2 = { id: "2", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/MLB2222" } as Offer;

      expect(getMarketplaceCatalogKey(offer1)).not.toBe(getMarketplaceCatalogKey(offer2));
    });

    it("deve usar item_id para ML sem URL de catalogo", () => {
      const offer = { id: "1", platform: "Mercado Livre", item_id: "MLB12345", original_url: "https://produto.mercadolivre.com.br/MLB-12345-produto" } as Offer;
      expect(getMarketplaceCatalogKey(offer)).toBe("mercado-livre:item:MLB12345");
    });

    it("usa identidade nativa de Shopee e Amazon", () => {
      expect(getCommercialProductIdentity({ id: "shp-1", platform: "Shopee", shopee_item_id: "S0001" } as Offer)).toBe("shopee:item:S0001");
      expect(getCommercialProductIdentity({ id: "amz-1", platform: "Amazon", product_id: "B000123456" } as Offer)).toBe("amazon:asin:B000123456");
    });

    it("extrai identidade de Shopee e ASIN da URL quando o native id falta", () => {
      expect(getCommercialProductIdentity({ id: "shp-1", platform: "Shopee", original_url: "https://shopee.com.br/produto-i.77.888?af=1" } as Offer)).toBe("shopee:item:888");
      expect(getCommercialProductIdentity({ id: "amz-1", platform: "Amazon", original_url: "https://www.amazon.com.br/gp/product/B000123456?tag=x" } as Offer)).toBe("amazon:asin:B000123456");
    });

    it("prioriza product_id de catálogo no ML", () => {
      expect(getCommercialProductIdentity({ id: "ml-1", platform: "Mercado Livre", product_id: "MLB999", item_id: "MLB111", original_url: "https://mercadolivre.com.br/p/MLB222" } as Offer)).toBe("mercado-livre:catalog:MLB999");
    });

    it("deve retornar fallback se item_id estiver ausente para fallback type", () => {
      const offer = { id: "123", platform: "Mercado Livre" } as Offer;
      expect(getMarketplaceCatalogKey(offer)).toBe("mercado-livre:offer:123");
    });
  });

  describe("identidade comercial e deduplicação", () => {
    it("deduplica ML catálogo mesmo com item_ids diferentes", () => {
      const offers = [
        { id: "ml-1", platform: "Mercado Livre", product_id: null, item_id: "MLB-1", original_url: "https://mercadolivre.com.br/p/MLB123?x=1", score: 10 },
        { id: "ml-2", platform: "Mercado Livre", product_id: null, item_id: "MLB-2", original_url: "https://mercadolivre.com.br/p/MLB123?x=2", score: 20 },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)).toHaveLength(1);
      expect(deduplicateCommercialOffers(offers)[0].id).toBe("ml-2");
    });

    it("deduplica Amazon pelo mesmo ASIN/product_id", () => {
      const offers = [
        { id: "amz-1", platform: "Amazon", product_id: "B000123456", original_url: "https://amazon.com.br/dp/B000123456", score: 10 },
        { id: "amz-2", platform: "Amazon", product_id: "B000123456", original_url: "https://amazon.com.br/dp/B000123456?tag=updated", score: 20 },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)).toHaveLength(1);
      expect(deduplicateCommercialOffers(offers)[0].id).toBe("amz-2");
    });

    it("mantém ML item_ids distintos sem catálogo", () => {
      const offers = [
        { id: "ml-1", platform: "Mercado Livre", item_id: "MLB-1", original_url: "https://produto.mercadolivre.com.br/MLB-1" },
        { id: "ml-2", platform: "Mercado Livre", item_id: "MLB-2", original_url: "https://produto.mercadolivre.com.br/MLB-2" },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)).toHaveLength(2);
    });

    it("não colapsa o mesmo ID textual entre marketplaces", () => {
      const offers = [
        { id: "shp", platform: "Shopee", shopee_item_id: "123", original_url: "https://shopee.com.br/product/1/123" },
        { id: "amz", platform: "Amazon", product_id: "123", original_url: "https://amazon.com.br/dp/1234567890" },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)).toHaveLength(2);
    });

    it("agrupa URL canônica apesar de preço atualizado e query diferente", () => {
      const offers = [
        { id: "old", platform: "Amazon", original_url: "https://www.amazon.com.br/produto?tag=old", current_price: 100, score: 10 },
        { id: "new", platform: "Amazon", original_url: "https://www.amazon.com.br/produto?tag=new", current_price: 90, score: 20 },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)).toHaveLength(1);
      expect(getCommercialProductIdentity(offers[0])).toBe(getCommercialProductIdentity(offers[1]));
    });

    it("mantém produtos realmente diferentes separados", () => {
      const offers = [
        { id: "a", platform: "Shopee", shopee_item_id: "1", original_url: "https://shopee.com.br/product/1/1" },
        { id: "b", platform: "Shopee", shopee_item_id: "2", original_url: "https://shopee.com.br/product/1/2" },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)).toHaveLength(2);
    });

    it("não apaga rows e escolhe vencedor determinístico", () => {
      const offers = [
        { id: "b", platform: "Shopee", shopee_item_id: "1", score: 50, original_url: "https://shopee.com.br/product/1/1" },
        { id: "a", platform: "Shopee", shopee_item_id: "1", score: 50, original_url: "https://shopee.com.br/product/1/1" },
      ] as Offer[];
      expect(deduplicateCommercialOffers(offers)[0].id).toBe("a");
      expect(offers).toHaveLength(2);
    });
  });

  describe("selectCatalogWinner", () => {
    const baseOffer = {
      id: "base",
      score: 50,
      current_price: 100,
      old_price: 120,
      source_position: 1,
      created_at: "2026-07-26T10:00:00Z"
    } as Offer;

    it("deve respeitar a ordem deterministica: score, discount, price, position, date, id", () => {
      // Diferentes scores
      expect(selectCatalogWinner([
        { ...baseOffer, id: "1", score: 40 },
        { ...baseOffer, id: "2", score: 60 }
      ]).id).toBe("2");

      // Mesmo score, diferentes descontos
      expect(selectCatalogWinner([
        { ...baseOffer, id: "1", current_price: 100, old_price: 150 }, // desc: 50
        { ...baseOffer, id: "2", current_price: 100, old_price: 120 }  // desc: 20
      ]).id).toBe("1");

      // Mesmo score e desconto, diferentes precos
      expect(selectCatalogWinner([
        { ...baseOffer, id: "1", current_price: 80, old_price: 100 },
        { ...baseOffer, id: "2", current_price: 90, old_price: 110 }
      ]).id).toBe("1");

      // Mesmo score, desc e preco, diferentes posicoes
      expect(selectCatalogWinner([
        { ...baseOffer, id: "1", source_position: 5 },
        { ...baseOffer, id: "2", source_position: 2 }
      ]).id).toBe("2");

      // Mesmo score, desc, preco, posicao, datas diferentes
      expect(selectCatalogWinner([
        { ...baseOffer, id: "1", created_at: "2026-07-26T10:00:00Z" },
        { ...baseOffer, id: "2", created_at: "2026-07-26T11:00:00Z" }
      ]).id).toBe("2"); // 2 é mais recente

      // Tudo igual, fallback para ID lexical
      expect(selectCatalogWinner([
        { ...baseOffer, id: "b" },
        { ...baseOffer, id: "a" }
      ]).id).toBe("a");
    });

    it("deve tratar null/undefined sem falhar", () => {
      const winner = selectCatalogWinner([
        { id: "1", score: 10 } as Offer,
        { id: "2", score: undefined as any } as Offer,
        { id: "3", current_price: 10 } as Offer
      ]);
      // offer 1 tem score, ganha
      expect(winner.id).toBe("1");
    });

    it("nenhuma mutacao ocorre", () => {
      const o1 = { id: "1", score: 10 } as Offer;
      const o2 = { id: "2", score: 20 } as Offer;
      const arr = [o1, o2];

      const winner = selectCatalogWinner(arr);
      expect(winner.id).toBe("2");
      expect(arr[0].id).toBe("1"); // array nao foi ordenado in-place
    });
  });
});
