import { describe, it, expect } from "vitest";
import { normalizeCandidateToV2 } from "@/core/offer-selection/normalize-candidate";
import { extractEvidence } from "@/core/offer-selection/evidence";

describe("Sprint 2 — Contrato Canônico CandidateDecisionV2 e Normalização", () => {
  it("normaliza candidato da Amazon preservando ASIN, Prime e proveniência", () => {
    const rawAmazon = {
      marketplace: "Amazon",
      sourceItemId: "B09ABC0001",
      title: "Notebook Acer Aspire 5 Intel Core i5 8GB 512GB SSD 15.6 Full HD",
      sourceUrl: "https://www.amazon.com.br/dp/B09ABC0001",
      imageUrl: "https://m.media-amazon.com/images/I/notebook.jpg",
      currentPrice: 2499.0,
      originalPrice: 3199.0,
      marketplaceMetrics: {
        asin: "B09ABC0001",
        rating: 4.6,
        reviewCount: 1250,
        prime: true,
        shippingFree: true,
      },
      intentId: "informatica_editorial",
    };

    const candidate = normalizeCandidateToV2(rawAmazon, {
      correlationId: "corr-amz-1",
      discoveredAt: "2026-09-07T12:00:00.000Z",
    });

    expect(candidate.marketplace).toBe("Amazon");
    expect(candidate.nativeIdentity).toBe("B09ABC0001");
    expect(candidate.sourceItemId).toBe("B09ABC0001");
    expect(candidate.evidence.currentPrice).toBe(2499.0);
    expect(candidate.evidence.originalPrice).toBe(3199.0);
    expect(candidate.evidence.discountPercent).toBeCloseTo(21.88, 1);
    expect(candidate.evidence.discountConfidence).toBe("verified");
    expect(candidate.evidence.rating).toBe(4.6);
    expect(candidate.evidence.reviewCount).toBe(1250);
    expect(candidate.evidence.prime).toBe(true);
    expect(candidate.evidence.shippingFree).toBe(true);
    expect(candidate.evidence.provenance).toContain("amazon.prime");
    expect(candidate.evidence.provenance).toContain("amazon.metrics");
    expect(candidate.trace.correlationId).toBe("corr-amz-1");
  });

  it("normaliza candidato do Mercado Livre preservando item_id, loja oficial e vendas", () => {
    const rawML = {
      marketplace: "Mercado Livre",
      sourceItemId: "MLB100123456",
      title: "Monitor Dell 27 Polegadas Full HD SE2722H 75Hz",
      sourceUrl: "https://www.mercadolivre.com.br/p/MLB100123456",
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_monitor.jpg",
      currentPrice: 849.0,
      originalPrice: 1099.0,
      marketplaceMetrics: {
        item_id: "MLB100123456",
        rating: 4.8,
        reviewCount: 1100,
        sold_quantity: 2200,
        official_store_id: "12345",
        shippingFree: true,
      },
    };

    const candidate = normalizeCandidateToV2(rawML);

    expect(candidate.marketplace).toBe("Mercado Livre");
    expect(candidate.nativeIdentity).toBe("MLB100123456");
    expect(candidate.evidence.sales).toBe(2200);
    expect(candidate.evidence.officialStore).toBe(true);
    expect(candidate.evidence.rating).toBe(4.8);
    expect(candidate.evidence.shippingFree).toBe(true);
    expect(candidate.evidence.provenance).toContain("mercadolivre.official_store");
    expect(candidate.evidence.provenance).toContain("mercadolivre.sold_quantity");
  });

  it("normaliza candidato da Shopee preservando shopee_item_id, Mall e comissão", () => {
    const rawShopee = {
      marketplace: "Shopee",
      sourceItemId: "99887766",
      title: "Teclado Mecânico Gamer Redragon Kumara Switch Blue",
      sourceUrl: "https://shopee.com.br/product/1001/99887766",
      imageUrl: "https://cf.shopee.com.br/file/teclado.jpg",
      currentPrice: 179.9,
      originalPrice: 249.9,
      marketplaceMetrics: {
        shopee_item_id: "99887766",
        rating_star: 4.9,
        reviewCount: 3800,
        sales: 8200,
        isMall: true,
        hasExtraCommission: true,
      },
      prePersistMonetized: true,
    };

    const candidate = normalizeCandidateToV2(rawShopee);

    expect(candidate.marketplace).toBe("Shopee");
    expect(candidate.nativeIdentity).toBe("99887766");
    expect(candidate.evidence.officialStore).toBe(true); // Mall equivale a official store
    expect(candidate.evidence.rating).toBe(4.9);
    expect(candidate.evidence.sales).toBe(8200);
    expect(candidate.evidence.monetizationValid).toBe(true);
    expect(candidate.evidence.provenance).toContain("shopee.mall");
    expect(candidate.evidence.provenance).toContain("shopee.extra_commission");
  });

  it("trata ausência de métricas como null e nunca como números inventados", () => {
    const candidateWithoutMetrics = {
      marketplace: "Amazon",
      sourceItemId: "B09EMPTY01",
      title: "Switch de Rede 8 Portas",
      sourceUrl: "https://www.amazon.com.br/dp/B09EMPTY01",
      imageUrl: "https://m.media-amazon.com/images/I/switch.jpg",
      currentPrice: 150.0,
      originalPrice: null,
      marketplaceMetrics: {},
    };

    const candidate = normalizeCandidateToV2(candidateWithoutMetrics);

    expect(candidate.evidence.originalPrice).toBeNull();
    expect(candidate.evidence.discountPercent).toBeNull();
    expect(candidate.evidence.discountConfidence).toBe("none");
    expect(candidate.evidence.rating).toBeNull();
    expect(candidate.evidence.reviewCount).toBeNull();
    expect(candidate.evidence.sales).toBeNull();
  });

  it("neutraliza preço de referência implausível sem descartar o produto válido", () => {
    const candidateWithBadRef = {
      marketplace: "Mercado Livre",
      sourceItemId: "MLB999888",
      title: "SSD 1TB NVMe",
      sourceUrl: "https://www.mercadolivre.com.br/p/MLB999888",
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_ssd.jpg",
      currentPrice: 300.0,
      originalPrice: 250.0, // menor que o preço atual (inválido)
      marketplaceMetrics: {},
    };

    const evidence = extractEvidence(candidateWithBadRef);
    expect(evidence.originalPrice).toBeNull();
    expect(evidence.discountPercent).toBeNull();
    expect(evidence.discountConfidence).toBe("none");
  });
});
