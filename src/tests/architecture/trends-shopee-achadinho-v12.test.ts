import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const {
  buildPeerContext,
  classifyPeerIdentity,
  collectShopeeMarketplaceCandidates,
  scoreShopeeAchadinhoCandidate,
  selectShopeeAchadinhosV12,
} = require("../../../scripts/shopee-achadinho-v12.cjs");
const {
  buildShopeePeerScoringPool,
} = require("../../../scripts/oracle-trends-radar-runner.cjs");

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
  it("replaces the Shopee selector in the runtime instead of delegating to the legacy engine", () => {
    const runnerPath = resolve(__dirname, "../../../scripts/oracle-trends-radar-runner.cjs");
    const source = readFileSync(runnerPath, "utf8");

    expect(source).toContain("engine.collectShopeeMarketplaceCandidates");
    expect(source).toContain("engine.buildTrendRadarProductsFromCandidates");
    expect(source).not.toContain("return engine.processPendingTrendRadarRuns(options)");
    expect(source).not.toContain("return engine.processPendingTrendRadarRuns({ ...options, client })");
  });

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

  it("keeps TV supports, router supports and generic adhesive supports in separate peer types", () => {
    const tvFixed = classifyPeerIdentity("Suporte para TV Universal Fixo Smart LED LCD 4K Parede 32 a 100 Polegadas");
    const tvArticulated = classifyPeerIdentity("Suporte para TV Articulado Retrátil 10 a 55 Polegadas VESA 200x200");
    const router = classifyPeerIdentity("Suporte para Roteador e Modem de Parede Sem Furo com Fita 3M Universal");
    const adhesive = classifyPeerIdentity("Suporte Parede Adesivo Multiuso Organizador Controle Remoto");

    expect(tvFixed.peerType).toBe("suporte_tv_fixo");
    expect(tvArticulated.peerType).toBe("suporte_tv_articulado");
    expect(router.peerType).toBe("suporte_roteador_parede");
    expect(adhesive.peerType).toBe("suporte_parede_adesivo_multiuso");
    expect(new Set([tvFixed.peerType, tvArticulated.peerType, router.peerType, adhesive.peerType]).size).toBe(4);
  });

  it("classifies observed high-intent utilities instead of collapsing them to item_isolado", () => {
    expect(classifyPeerIdentity("Pino Adaptador Tomada Dobravel Articulado Flex 3 Saída 16A").peerType)
      .toBe("adaptador_tomada_articulado");
    expect(classifyPeerIdentity("Kit 3 Em 1 Bico Alta Pressão Para Mangueira + Conector Top").peerType)
      .toBe("bico_mangueira_alta_pressao");
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

  it("uses historical/existing-offer exclusions as peers without making them selectable", () => {
    const target = candidate({ itemId: "target", shopId: "target-shop", currentPrice: 10 });
    const excludedPeers = [
      candidate({ itemId: "historical-1", shopId: "h1", currentPrice: 20 }),
      candidate({ itemId: "historical-2", shopId: "h2", currentPrice: 21 }),
      candidate({ itemId: "existing-offer", shopId: "h3", currentPrice: 22 }),
    ];

    const scoringPool = buildShopeePeerScoringPool([target], excludedPeers);
    const selected = selectShopeeAchadinhosV12(scoringPool, { maxProducts: 20 });

    expect(scoringPool).toHaveLength(4);
    expect(scoringPool.filter((row: any) => row.peerReferenceOnly)).toHaveLength(3);
    expect(selected).toHaveLength(1);
    expect(selected[0].candidate.itemId).toBe("target");
    expect(selected[0].peer.peerCount).toBe(3);
    expect(selected[0].peer.peerConfidence).toBe("MEDIUM");
    expect(selected[0].offerPriceScore).toBe(15);
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
