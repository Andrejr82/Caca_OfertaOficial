import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  buildPeerContext,
  classifyPeerIdentity,
  collectShopeeMarketplaceCandidates,
  scoreShopeeAchadinhoCandidate,
  selectShopeeAchadinhosV12,
} = require("../../../scripts/shopee-achadinho-v12.cjs");

type Candidate = {
  marketplace: "Shopee";
  itemId: string;
  shopId: string;
  shopName?: string;
  productName: string;
  currentPrice: number;
  oldPrice?: number | null;
  discountPercent?: number;
  sales: number;
  ratingStar: number;
  commissionPercent: number;
  sellerCommissionRate: number;
  imageUrl: string;
  permalink: string;
};

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    marketplace: "Shopee",
    itemId: "item-1",
    shopId: "shop-1",
    shopName: "Loja 1",
    productName: "Fone TWS Bluetooth X55 LED",
    currentPrice: 12.51,
    oldPrice: null,
    discountPercent: 0,
    sales: 39410,
    ratingStar: 4.9,
    commissionPercent: 11,
    sellerCommissionRate: 0,
    imageUrl: "https://cf.shopee.com.br/file/item-1",
    permalink: "https://s.shopee.com.br/item-1",
    ...overrides,
  };
}

function node(itemId: string, shopId: string, productName: string) {
  return {
    itemId,
    shopId,
    shopName: `Loja ${shopId}`,
    productName,
    priceMin: "39.90",
    priceMax: "39.90",
    sales: "1000",
    ratingStar: "4.8",
    commissionRate: "10",
    sellerCommissionRate: "5",
    offerLink: `https://s.shopee.com.br/${shopId}-${itemId}`,
    imageUrl: `https://cf.shopee.com.br/file/${shopId}-${itemId}`,
  };
}

describe("Shopee Achadinho Quality Gate V1.2", () => {
  it("collects two official pages and deduplicates by shopId + itemId", async () => {
    const pages: number[] = [];
    const request = async (_operation: string, _query: string, variables: { page: number }) => {
      pages.push(variables.page);
      const rows = variables.page === 1
        ? [node("1", "a", "Produto A"), node("2", "b", "Produto B")]
        : [node("1", "a", "Produto A repetido"), node("3", "c", "Produto C")];
      return { data: { data: { productOfferV2: { nodes: rows } } } };
    };

    const result = await collectShopeeMarketplaceCandidates({
      request,
      categoryIds: [100010],
      maxPerCategory: 5,
      maxPagesPerCategory: 2,
    });

    expect(pages).toEqual([1, 2]);
    expect(result.map((row: Candidate) => row.itemId)).toEqual(["1", "2", "3"]);
  });

  it("uses strict functional peer identities instead of broad categories", () => {
    expect(classifyPeerIdentity("Fone TWS Bluetooth X55 LED").peerType).toBe("fones_tws_bluetooth");
    expect(classifyPeerIdentity("Cordão Celular Crossbody Anti-Perda").peerType).toBe("cordao_celular");
    expect(classifyPeerIdentity("Jogo Lençol 400 Fios Ponto Palito 3 Peças").peerType).toBe("jogo_lencol_400_fios");
    expect(classifyPeerIdentity("Chave T Longa Máquina de Lavar 10mm").peerType).toBe("chave_t_maquina_lavar");
  });

  it("excludes the candidate itself from peers and requires at least three real peers for price authority", () => {
    const target = candidate({ itemId: "target", currentPrice: 12.51 });
    const pool = [
      target,
      candidate({ itemId: "p1", shopId: "s1", currentPrice: 13.99 }),
      candidate({ itemId: "p2", shopId: "s2", currentPrice: 17.87 }),
    ];

    const peer = buildPeerContext(target, pool);
    expect(peer.peerCount).toBe(2);
    expect(peer.peerConfidence).toBe("LOW");
    expect(peer.offerPriceScore).toBe(0);
  });

  it("does not compare kits against unitary products when quantity is materially different", () => {
    const kit = candidate({
      itemId: "kit",
      productName: "Kit Completo Maca Power Karseell Máscara 500g Shampoo 1L Condicionador 1L Óleo 50ml 4 Itens",
      currentPrice: 49,
    });
    const unit = candidate({
      itemId: "unit",
      shopId: "shop-unit",
      productName: "Máscara Karseell Maca Power 100g",
      currentPrice: 10.9,
    });

    const peer = buildPeerContext(kit, [kit, unit]);
    expect(peer.peerCount).toBe(0);
    expect(peer.offerPriceScore).toBe(0);
  });

  it("lets exceptional achadinho value survive without peer-price evidence", () => {
    const tool = candidate({
      itemId: "tool",
      productName: "40 Peças Jogo De Chave Catraca Caixa De Ferramentas",
      currentPrice: 28.99,
      sales: 10130,
      ratingStar: 4.8,
      commissionPercent: 0,
      sellerCommissionRate: 0,
    });

    const score = scoreShopeeAchadinhoCandidate(tool, [tool]);
    expect(score.offerStrength).toBe(0);
    expect(score.achadinhoValue).toBeGreaterThanOrEqual(16);
    expect(score.passesGate).toBe(true);
  });

  it("does not let commission rescue a catalog-like candidate", () => {
    const catalog = candidate({
      itemId: "catalog",
      productName: "Camiseta Básica Lisa Masculina",
      currentPrice: 90,
      sales: 300,
      ratingStar: 4.9,
      commissionPercent: 49,
      sellerCommissionRate: 0,
    });

    const score = scoreShopeeAchadinhoCandidate(catalog, [catalog]);
    expect(score.commercialValue).toBe(10);
    expect(score.catalogPenalty).toBe(-15);
    expect(score.passesGate).toBe(false);
  });

  it("enforces store/family diversity and removes near-redundant products", () => {
    const pool: Candidate[] = [
      candidate({ itemId: "tws-1", shopId: "same", productName: "Fone TWS Bluetooth X55 LED", sales: 40000 }),
      candidate({ itemId: "tws-2", shopId: "same", productName: "Fone TWS Bluetooth X55 Pro LED", sales: 39000 }),
      candidate({ itemId: "tws-3", shopId: "same", productName: "Fone TWS Bluetooth Air Pro 6", sales: 38000 }),
      candidate({ itemId: "mixer", shopId: "kitchen", productName: "Batedor Mixer Elétrico 2 em 1 Bebidas", currentPrice: 18.99, sales: 24385 }),
      candidate({ itemId: "tools", shopId: "garage", productName: "40 Peças Jogo De Chave Catraca Caixa De Ferramentas", currentPrice: 28.99, sales: 10130 }),
      candidate({ itemId: "sheet", shopId: "home", productName: "Jogo Lençol 400 Fios Ponto Palito 3 Peças", currentPrice: 11.6, sales: 81052 }),
    ];

    const selected = selectShopeeAchadinhosV12(pool, { maxProducts: 20 });
    expect(selected.filter((row: any) => row.candidate.shopId === "same").length).toBeLessThanOrEqual(2);
    expect(new Set(selected.map((row: any) => row.candidate.itemId)).size).toBe(selected.length);
  });
});
