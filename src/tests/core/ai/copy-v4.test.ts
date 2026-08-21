import { describe, expect, it } from "vitest";
import {
  buildConversionCopyV4Contract,
  buildCopyV4ChannelCopy,
  getMarketplaceCtaPrefix,
} from "@/core/ai/copy-v4";

describe("Social Copy V4 — Padrão Brasileiro de Ofertas e Achadinhos", () => {
  it("CASO A — desconto factual com de/por sem avaliação automática", () => {
    const facts = {
      productName: "Jogo Churrasco Tramontina 12 peças",
      marketplace: "Amazon",
      category: "Cozinha",
      currentPrice: 69,
      originalPrice: 150,
      evidence: { rating: 5 },
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");

    expect(copy).toContain("🔥 Jogo Churrasco Tramontina 12 peças");
    expect(copy).toContain("De R$ 150,00\npor R$ 69,00");
    expect(copy).toContain("👉 Achado na Amazon:");
    expect(copy).not.toMatch(/Avaliação|⭐/iu);
  });

  it("CASO B — sem desconto com preço único e atributos técnicos objetivos A • B • C", () => {
    const facts = {
      productName: "Ar Condicionado Philco Inverter 9000 BTUs Frio 220V",
      marketplace: "Mercado Livre",
      category: "Ar e Ventilação",
      currentPrice: 1738,
      originalPrice: null,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");

    expect(copy).toContain("❄️ Ar Condicionado Philco Inverter 9000 BTUs Frio 220V");
    expect(copy).toContain("R$ 1.738,00");
    expect(copy).toContain("Inverter • 9000 BTUs • Frio • 220V");
    expect(copy).toContain("👉 Achado no Mercado Livre:");
  });

  it("CASO C — cupom factual", () => {
    const facts = {
      productName: "Kit Body Splash Masculino 200ml",
      marketplace: "Shopee",
      category: "Beleza",
      currentPrice: 71.22,
      originalPrice: 140,
      evidence: { coupon: "CHALEIRA" },
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");
    expect(copy).toContain("🎟️ Cupom: CHALEIRA");
  });

  it("CASO D — frete grátis confirmado", () => {
    const facts = {
      productName: "Jogo Churrasco Tramontina 12 peças",
      marketplace: "Amazon",
      category: "Cozinha",
      currentPrice: 69,
      originalPrice: 150,
      freeShipping: true,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");
    expect(copy).toContain("📦 Frete grátis");
  });

  it("CASO E — loja oficial confirmada com nome ou marketplace", () => {
    const factsWithSeller = {
      productName: "Kit Body Splash Masculino 200ml",
      marketplace: "Shopee",
      category: "Beleza",
      currentPrice: 71.22,
      originalPrice: 140,
      evidence: { seller_name: "Primacial", official_store: true },
    };
    const copy1 = buildCopyV4ChannelCopy(factsWithSeller, "whatsapp");
    expect(copy1).toContain("🏪 Loja oficial Primacial");

    const factsGenericStore = {
      productName: "Smartphone Galaxy A55",
      marketplace: "Mercado Livre",
      category: "Celulares",
      currentPrice: 1899,
      originalPrice: null,
      evidence: { official_store: true },
    };
    const copy2 = buildCopyV4ChannelCopy(factsGenericStore, "whatsapp");
    expect(copy2).toContain("🏪 Loja oficial no marketplace");
  });

  it("CASO F — rating simples 5/5 sem volume relevante é omitido", () => {
    const facts = {
      productName: "Suporte para Notebook Ajustável",
      marketplace: "Mercado Livre",
      category: "Informática",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: { rating: 5 },
    };

    const contract = buildConversionCopyV4Contract(facts, "whatsapp");
    expect(contract.proofLine).toBeNull();
  });

  it("CASO G — rating com grande volume factual (>= 1000 avaliações) gera prova social", () => {
    const facts = {
      productName: "Fone JBL Tune 520BT",
      marketplace: "Amazon",
      category: "Áudio",
      currentPrice: 199,
      originalPrice: 299,
      evidence: { rating: 4.9, reviews_count: 5000 },
    };

    const contract = buildConversionCopyV4Contract(facts, "whatsapp");
    expect(contract.proofLine).toBe("⭐ Avaliação 4,9/5 com mais de 5 mil avaliações.");
  });

  it("CASO H — poucos dados gera somente produto, preço e CTA sem inventar nada", () => {
    const facts = {
      productName: "Organizador Simples",
      marketplace: "Mercado Livre",
      category: null,
      currentPrice: 45,
      originalPrice: null,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");
    const blocks = copy.split("\n\n");

    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe("🔥 Organizador Simples");
    expect(blocks[1]).toBe("R$ 45,00");
    expect(blocks[2]).toBe("👉 Achado no Mercado Livre:");
  });

  it("CASO I — atributos técnicos sem interpretação adjetivada", () => {
    const facts = {
      productName: "Air Fryer Mondial 5 Litros 1900W 220V",
      marketplace: "Amazon",
      category: "Cozinha",
      currentPrice: 349,
      originalPrice: 499,
      evidence: {},
    };

    const contract = buildConversionCopyV4Contract(facts, "whatsapp");
    expect(contract.attributesLine).toBe("5 litros • 1900W • 220V");
  });

  it("CASO J — ausência total de expressões proibidas e adjetivos inventados", () => {
    const facts = {
      productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
      marketplace: "Mercado Livre",
      category: "Mochilas",
      currentPrice: 88,
      originalPrice: 269,
      evidence: { mercadolivre_highlights: "BEST_SELLER pos #14", rating: 4.8 },
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");
    expect(copy).not.toMatch(/chamou atenção pela prova/iu);
    expect(copy).not.toMatch(/informada pelo marketplace/iu);
    expect(copy).not.toMatch(/no preço informado agora/iu);
    expect(copy).not.toMatch(/boa opção para/iu);
    expect(copy).not.toMatch(/praticidade|confortável|moderno|rápido|completo|ideal para|perfeito para|imperdível|últimas unidades|promoção acaba hoje|estoque acabando/iu);
  });

  it("CASO PIX — formata 'no PIX' somente quando há comprovação factual", () => {
    const facts = {
      productName: "Kit Body Splash Masculino 200ml",
      marketplace: "Shopee",
      category: "Beleza",
      currentPrice: 71.22,
      originalPrice: 140,
      evidence: { payment_method: "pix" },
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");
    expect(copy).toContain("De R$ 140,00\npor R$ 71,22 no PIX");
  });

  it("CASO K/L — WhatsApp e Telegram possuem prefixos de CTA adequados", () => {
    expect(getMarketplaceCtaPrefix("Amazon")).toBe("👉 Achado na Amazon:");
    expect(getMarketplaceCtaPrefix("Mercado Livre")).toBe("👉 Achado no Mercado Livre:");
    expect(getMarketplaceCtaPrefix("Shopee")).toBe("👉 Achado na Shopee:");
    expect(getMarketplaceCtaPrefix("Magalu")).toBe("👉 Achado no Magalu:");
    expect(getMarketplaceCtaPrefix("Shein")).toBe("👉 Achado na Shein:");
    expect(getMarketplaceCtaPrefix("Outro")).toBe("👉 Ver oferta:");
  });

  it("CASO M — Facebook gera CTA para o primeiro comentário e zero URL no corpo", () => {
    const facts = {
      productName: "Notebook Lenovo IdeaPad 16GB RAM 512GB SSD Ryzen 7",
      marketplace: "Mercado Livre",
      category: "Informática",
      currentPrice: 2899,
      originalPrice: null,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "facebook");
    expect(copy).toContain("💻 Notebook Lenovo IdeaPad");
    expect(copy).toContain("👉 Link da oferta no primeiro comentário. 👇");
    expect(copy).not.toMatch(/https?:\/\//u);
  });

  it("CASO N — Instagram mantém CTA no link da bio e zero URL no corpo", () => {
    const facts = {
      productName: "Fone JBL Tune 520BT Bluetooth Sem fio",
      marketplace: "Amazon",
      category: "Áudio",
      currentPrice: 199,
      originalPrice: 299,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "instagram");
    expect(copy).toContain("🎧 Fone JBL Tune 520BT");
    expect(copy).toContain("🔎 Link da oferta na bio. 👇");
    expect(copy).not.toMatch(/https?:\/\//u);
  });
});
