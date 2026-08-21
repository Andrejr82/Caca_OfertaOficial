import { describe, expect, it } from "vitest";
import { buildConversionCopyV4Contract, buildCopyV4ChannelCopy } from "@/core/ai/copy-v4";

describe("Copy V4 — contrato de decisão de compra", () => {
  it("prioriza prova oficial de bestseller e mantém um CTA único", () => {
    const facts = {
      marketplace: "Mercado Livre",
      productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
      category: "Calçados, Roupas e Bolsas",
      currentPrice: 88,
      originalPrice: 269,
      evidence: { mercadolivre_highlights: "BEST_SELLER pos #14" },
    };

    const contract = buildConversionCopyV4Contract(facts, "whatsapp");
    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");

    expect(contract.commercialAngle).toBe("proof");
    expect(contract.proofLine).toMatch(/Top #14/iu);
    expect(contract.hook).toMatch(/67% OFF/iu);
    expect(contract.hook).toMatch(/R\$\s*88,00/iu);
    expect(copy.match(/Conferir o preço atual/giu)).toHaveLength(1);
    expect(copy).not.toMatch(/últimas unidades|só hoje|corre que|estoque acaba/iu);
  });

  it("usa economia real quando não existe prova social forte", () => {
    const contract = buildConversionCopyV4Contract({
      marketplace: "Shopee",
      productName: "Fone Bluetooth Recarregável",
      category: "Eletrônicos",
      currentPrice: 79.9,
      originalPrice: 129.9,
      evidence: {},
    }, "telegram");

    expect(contract.commercialAngle).toBe("saving");
    expect(contract.proofLine).toBeNull();
    expect(contract.hook).toContain("R$ 79,90");
    expect(contract.hook).toContain("38% OFF");
    expect(contract.offerLine).toContain("Economia de R$ 50,00.");
    expect(contract.cta).toBe("👉 Conferir o preço atual 👇");
  });

  it("favorece preço direto na primeira linha quando não há desconto nem prova", () => {
    const contract = buildConversionCopyV4Contract({
      marketplace: "Mercado Livre",
      productName: "Suporte para Notebook Ajustável",
      category: "Informática",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    }, "instagram");

    expect(contract.commercialAngle).toBe("price");
    expect(contract.hook).toContain("R$ 59,90");
    expect(contract.offerLine).toBeNull();
    expect(contract.cta).toContain("link da bio");
  });

  it("não inventa prova quando a evidência não sustenta bestseller, loja oficial ou rating", () => {
    const contract = buildConversionCopyV4Contract({
      marketplace: "Shopee",
      productName: "Organizador Portátil",
      category: "Casa",
      currentPrice: 119,
      originalPrice: null,
      evidence: { source: "catalog" },
    }, "facebook");

    expect(contract.proofLine).toBeNull();
    expect(contract.commercialAngle).toBe("benefit");
    expect(contract.cta).toContain("primeiro comentário");
  });

  it("não calcula desconto quando preço anterior é inválido", () => {
    const contract = buildConversionCopyV4Contract({
      marketplace: "Mercado Livre",
      productName: "Produto Padrão",
      category: "Casa",
      currentPrice: 150,
      originalPrice: 140,
      evidence: {},
    }, "whatsapp");

    expect(contract.hook).toContain("por R$ 150,00");
    expect(contract.hook).not.toMatch(/OFF|economia/iu);
    expect(contract.offerLine).toBeNull();
  });

  it("caso A: gera modelo comercial de referência com emoji contextual, rating e benefício natural", () => {
    const facts = {
      productName: "Ar Condicionado Inverter Philco 9000 BTUs Frio 220V",
      marketplace: "Mercado Livre",
      category: "Ar e Ventilação",
      currentPrice: 1738,
      originalPrice: null,
      evidence: {
        rating: 5,
        specs: "frio, 220V, Inverter 9000 BTUs",
      },
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");

    expect(copy).toContain("❄️ Ar Condicionado Inverter Philco 9000 BTUs Frio 220V por R$ 1.738,00");
    expect(copy).toContain("⭐ Avaliação 5/5 no marketplace.");
    expect(copy).toContain("Boa opção para quem está procurando um modelo Inverter de 9000 BTUs, frio e 220V.");
    expect(copy).toContain("👉 Conferir o preço atual 👇");
  });

  it("caso B: inclui de/por no hook quando há desconto factual sem duplicar preço em outro bloco", () => {
    const facts = {
      productName: "Headset Bluetooth JBL",
      marketplace: "Amazon",
      category: "Áudio",
      currentPrice: 299.9,
      originalPrice: 399.9,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "telegram");

    expect(copy).toContain("🎧 Headset Bluetooth JBL de R$ 399,90 por R$ 299,90 — 25% OFF");
    expect(copy).not.toMatch(/R\$\s*299,90 no preço informado agora/iu);
  });

  it("caso C: omite benefício quando não há atributos factuais seguros no produto", () => {
    const facts = {
      productName: "Item Neutro Genérico",
      marketplace: "Mercado Livre",
      category: null,
      currentPrice: 50,
      originalPrice: null,
      evidence: {},
    };

    const contract = buildConversionCopyV4Contract(facts, "whatsapp");
    expect(contract.benefitLine).toBeNull();
  });

  it("caso D: Facebook gera CTA para primeiro comentário e zero URL no corpo", () => {
    const facts = {
      productName: "Notebook Lenovo IdeaPad 16GB RAM 512GB SSD",
      marketplace: "Mercado Livre",
      category: "Informática",
      currentPrice: 2899,
      originalPrice: null,
      evidence: {},
    };

    const copy = buildCopyV4ChannelCopy(facts, "facebook");
    expect(copy).toContain("💻 Notebook Lenovo IdeaPad");
    expect(copy).toContain("👉 Conferir o preço atual no primeiro comentário. 👇");
    expect(copy).not.toMatch(/https?:\/\//u);
  });

  it("caso F: garante ausência total de expressões burocráticas antigas", () => {
    const facts = {
      productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
      marketplace: "Mercado Livre",
      category: "Mochilas",
      currentPrice: 88,
      originalPrice: 269,
      evidence: { mercadolivre_highlights: "BEST_SELLER pos #14", rating: 4.8 },
    };

    const copy = buildCopyV4ChannelCopy(facts, "whatsapp");
    expect(copy).not.toMatch(/chamou atenção pela prova do marketplace/iu);
    expect(copy).not.toMatch(/informada pelo marketplace/iu);
    expect(copy).not.toMatch(/no preço informado agora/iu);
  });
});
