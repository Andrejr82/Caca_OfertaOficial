import { describe, it, expect } from "vitest";
import { getMarketplaceCatalogKey, selectCatalogWinner } from "../../../lib/offers/catalog-grouping";
import type { Offer } from "@/types/domain";

describe("catalog-grouping", () => {
  describe("getMarketplaceCatalogKey", () => {
    it("deve agrupar ofertas do ML com mesma URL de catálogo /p/MLB...", () => {
      const offer1 = { id: "1", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/MLB34722310?query=123" } as Offer;
      const offer2 = { id: "2", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/mlb34722310#test" } as Offer;

      const key1 = getMarketplaceCatalogKey(offer1);
      const key2 = getMarketplaceCatalogKey(offer2);

      expect(key1).toBe("ml:catalog:MLB34722310");
      expect(key1).toBe(key2);
    });

    it("nao deve agrupar ML com catalog_id diferentes", () => {
      const offer1 = { id: "1", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/MLB1111" } as Offer;
      const offer2 = { id: "2", platform: "Mercado Livre", original_url: "https://www.mercadolivre.com.br/p/MLB2222" } as Offer;

      expect(getMarketplaceCatalogKey(offer1)).not.toBe(getMarketplaceCatalogKey(offer2));
    });

    it("deve usar item_id para ML sem URL de catalogo", () => {
      const offer = { id: "1", platform: "Mercado Livre", item_id: "MLB12345", original_url: "https://produto.mercadolivre.com.br/MLB-12345-produto" } as Offer;
      expect(getMarketplaceCatalogKey(offer)).toBe("ml:item:MLB12345");
    });

    it("nao deve agrupar Amazon ou Shopee", () => {
      const offerAmz = { id: "amz1", platform: "Amazon", item_id: "B0001" } as Offer;
      const offerShp = { id: "shp1", platform: "Shopee", item_id: "S0001" } as Offer;

      expect(getMarketplaceCatalogKey(offerAmz)).toBe("other:amz1");
      expect(getMarketplaceCatalogKey(offerShp)).toBe("other:shp1");
    });

    it("deve retornar fallback se item_id estiver ausente para fallback type", () => {
      const offer = { id: "123", platform: "Mercado Livre" } as Offer;
      expect(getMarketplaceCatalogKey(offer)).toBe("other:123");
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
