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
    expect(contract.offerLine).toMatch(/67% OFF/iu);
    expect(contract.offerLine).toMatch(/R\$\s*181,00/iu);
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
    expect(contract.offerLine).toContain("economia de R$ 50,00");
    expect(contract.cta).toBe("👉 Conferir o preço atual 👇");
  });

  it("favorece preço de impulso abaixo de R$100 quando não há desconto nem prova", () => {
    const contract = buildConversionCopyV4Contract({
      marketplace: "Mercado Livre",
      productName: "Suporte para Notebook Ajustável",
      category: "Informática",
      currentPrice: 59.9,
      originalPrice: null,
      evidence: {},
    }, "instagram");

    expect(contract.commercialAngle).toBe("price");
    expect(contract.offerLine).toBe("R$ 59,90 no preço informado agora.");
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

    expect(contract.offerLine).toBe("R$ 150,00 no preço informado agora.");
    expect(contract.offerLine).not.toMatch(/OFF|economia/iu);
  });
});
