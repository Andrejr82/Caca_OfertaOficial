import { describe, expect, it } from "vitest";
import { planCommercialCopyV5 } from "@/core/ai/copy-v5-planner";
import type { AIProviderPort } from "@/core/ai/ports";
import type { CopyV5Facts, CopyV5Plan } from "@/core/ai/copy-v5-types";

function provider(content: Partial<CopyV5Plan>): AIProviderPort {
  return {
    name: "groq",
    model: "openai/gpt-oss-120b",
    async generate() {
      return { content, provider: "groq", model: "openai/gpt-oss-120b", latencyMs: 1 };
    },
  };
}

async function plan(facts: CopyV5Facts, content: Partial<CopyV5Plan>) {
  return planCommercialCopyV5(facts, provider(content));
}

describe("Copy V5 factual guard", () => {
  it("não transforma 100 vendas em mais de 100 clientes avaliando", async () => {
    const facts: CopyV5Facts = {
      productName: "Prendedor de Cortina Magnético 2/4/8 pcs",
      marketplace: "Shopee",
      category: "casa_cozinha_editorial",
      currentPrice: 16.99,
      originalPrice: null,
      evidence: { sales: 100, rating: 4.8, attributes: ["magnético", "2/4/8 peças"] },
    };

    const result = await plan(facts, {
      shortProductName: "Prendedor de Cortina Magnético 2/4/8 pcs",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "✅ Prendedor magnético com 4.8 de avaliação de mais de 100 clientes",
      benefitLine: "Prendedor magnético disponível em kits de 2, 4 ou 8 peças",
      selectedAttributes: ["magnético", "2/4/8 peças"],
      optionalProofAngle: null,
    });

    expect(result.hook).not.toMatch(/100\s+clientes/iu);
  });

  it("não transforma 1986 vendas em compradores que deram nota", async () => {
    const facts: CopyV5Facts = {
      productName: "Kit Shampoo 300ml + Condicionador 200ml Meu Liso Restauração Intensa",
      marketplace: "Shopee",
      category: "beleza_editorial",
      currentPrice: 17.9,
      originalPrice: null,
      evidence: { sales: 1986, rating: 4.9, attributes: ["Shampoo 300ml", "Condicionador 200ml"] },
    };

    const result = await plan(facts, {
      shortProductName: "Kit Shampoo + Condicionador Meu Liso",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "💬 Mais de 1.900 compradores dão 4.9 de avaliação ao Kit Meu Liso",
      benefitLine: null,
      selectedAttributes: ["Shampoo 300ml", "Condicionador 200ml"],
      optionalProofAngle: null,
    });

    expect(result.hook).not.toMatch(/1[.]?900\s+compradores/iu);
  });

  it("não transforma vendas de Moda em clientes que avaliaram", async () => {
    const facts: CopyV5Facts = {
      productName: "Tênis Masculino Polo Vili Madri Branco Casual",
      marketplace: "Shopee",
      category: "moda_editorial",
      currentPrice: 98.55,
      originalPrice: null,
      evidence: { sales: 202, rating: 4.9, attributes: ["masculino", "branco", "casual"] },
    };

    const result = await plan(facts, {
      shortProductName: "Tênis Polo Vili Madri Masculino Branco",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "Mais de 200 clientes avaliaram este tênis com 4.9",
      benefitLine: null,
      selectedAttributes: ["masculino", "branco", "casual"],
      optionalProofAngle: null,
    });

    expect(result.hook).not.toMatch(/clientes\s+avaliaram/iu);
  });

  it("não transforma vendas de Pet em donos que confiam", async () => {
    const facts: CopyV5Facts = {
      productName: "Caixa de Areia Gatos Grande 62x50x20 Furba Jumbox Pet Injet",
      marketplace: "Shopee",
      category: "pet_editorial",
      currentPrice: 50.4,
      originalPrice: null,
      evidence: { sales: 559, rating: 4.9, attributes: ["62x50x20 cm", "Furba Jumbox"] },
    };

    const result = await plan(facts, {
      shortProductName: "Caixa de Areia Furba Jumbox 62x50x20 cm",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "Mais de 500 donos de gatos já confiam na Furba Jumbox",
      benefitLine: null,
      selectedAttributes: ["62x50x20 cm", "Furba Jumbox"],
      optionalProofAngle: null,
    });

    expect(result.hook).not.toMatch(/donos\s+de\s+gatos/iu);
    expect(result.hook).not.toMatch(/confiam/iu);
  });

  it("remove claim de performance sem evidência explícita", async () => {
    const facts: CopyV5Facts = {
      productName: "Parafusadeira Furadeira Sem Fio 12V Com Maleta Bateria Brocas e 13 Acessórios FP12X NKF",
      marketplace: "Shopee",
      category: "ferramentas_editorial",
      currentPrice: 94.59,
      originalPrice: null,
      evidence: { sales: 422, rating: 4.9, attributes: ["12V", "Sem fio", "Maleta", "13 acessórios"] },
    };

    const result = await plan(facts, {
      shortProductName: "Parafusadeira Furadeira Sem Fio 12V com Maleta",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "Mais de 400 unidades vendidas e avaliação 4.9: a parafusadeira que entrega performance sem fio",
      benefitLine: null,
      selectedAttributes: ["12V", "Sem fio", "Maleta"],
      optionalProofAngle: null,
    });

    expect(result.hook).not.toMatch(/performance/iu);
  });

  it("preserva prova social quando vendas e rating permanecem separados", async () => {
    const facts: CopyV5Facts = {
      productName: "Parafusadeira Furadeira Sem Fio 12V",
      marketplace: "Shopee",
      category: "ferramentas_editorial",
      currentPrice: 94.59,
      originalPrice: null,
      evidence: { sales: 422, rating: 4.9, attributes: ["12V", "Sem fio"] },
    };
    const hook = "Mais de 400 unidades vendidas e avaliação 4.9";

    const result = await plan(facts, {
      shortProductName: "Parafusadeira Furadeira Sem Fio 12V",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook,
      benefitLine: null,
      selectedAttributes: ["12V", "Sem fio"],
      optionalProofAngle: null,
    });

    expect(result.hook).toBe(hook);
  });

  it("remove adequação inferida sem evidência explícita", async () => {
    const facts: CopyV5Facts = {
      productName: "Caixa de Areia Gatos Grande 62x50x20 Furba Jumbox Pet Injet",
      marketplace: "Shopee",
      category: "pet_editorial",
      currentPrice: 50.4,
      originalPrice: null,
      evidence: { sales: 559, rating: 4.9, attributes: ["62x50x20 cm", "Furba Jumbox"] },
    };

    const result = await plan(facts, {
      shortProductName: "Caixa de Areia Furba Jumbox 62x50x20",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "⭐ Caixa de Areia Furba Jumbox, 4.9 de avaliação e mais de 500 unidades vendidas",
      benefitLine: "Dimensões 62x50x20 cm, adequada para gatos grandes",
      selectedAttributes: ["62x50x20 cm", "Furba Jumbox"],
      optionalProofAngle: null,
    });

    expect(result.benefitLine).toBeNull();
  });

  it("remove confiança e otimização de consumo não comprovadas", async () => {
    const facts: CopyV5Facts = {
      productName: "Ar Condicionado Split Hi Wall Midea Airvolution Connect Inverter 12.000 Btus Frio 220V R-32",
      marketplace: "Shopee",
      category: "eletrodomesticos_editorial",
      currentPrice: 2065,
      originalPrice: null,
      evidence: { sales: 72, rating: 4.8, attributes: ["Inverter", "12.000 BTUs", "Frio", "220V", "R-32"] },
    };

    const result = await plan(facts, {
      shortProductName: "Ar Condicionado Midea Split Inverter 12.000 BTUs 220V",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "Mais de 70 unidades vendidas e avaliação 4.8: confiança no ar-condicionado Midea Inverter",
      benefitLine: "Tecnologia Inverter que otimiza o consumo de energia",
      selectedAttributes: ["Inverter", "12.000 BTUs", "Frio"],
      optionalProofAngle: null,
    });

    expect(result.hook).not.toMatch(/confian[cç]a/iu);
    expect(result.benefitLine).toBeNull();
  });

  it("preserva compatibilidade explicitamente sustentada", async () => {
    const facts: CopyV5Facts = {
      productName: "Teclado magnético BETTDOW para iPad 2025 A16 Gen10 Air11 (M3) Air4/5 10.9 Air6 11 M2 Pro11 2018-2022 Gen10",
      marketplace: "Shopee",
      category: "informatica_editorial",
      currentPrice: 379,
      originalPrice: null,
      evidence: { sales: 62, rating: 5, attributes: ["iPad A16/Gen10", "Air 11", "Pro 11"] },
    };

    const benefitLine = "Compatível com iPad A16/Gen10, Air 11 e Pro 11";
    const result = await plan(facts, {
      shortProductName: "Teclado magnético BETTDOW para iPad",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "🔝 Teclado magnético BETTDOW: 62 vendas e 5★ de avaliação",
      benefitLine,
      selectedAttributes: ["iPad A16/Gen10", "Air 11", "Pro 11"],
      optionalProofAngle: null,
    });

    expect(result.benefitLine).toBe(benefitLine);
  });

  it("preserva benefício composto apenas por atributos factuais", async () => {
    const facts: CopyV5Facts = {
      productName: "Parafusadeira Furadeira Sem Fio 12V Com Maleta Bateria Brocas e 13 Acessórios FP12X NKF",
      marketplace: "Shopee",
      category: "ferramentas_editorial",
      currentPrice: 94.59,
      originalPrice: null,
      evidence: { sales: 422, rating: 4.9, attributes: ["12V", "Sem fio", "Maleta", "13 acessórios"] },
    };

    const benefitLine = "12V sem fio com maleta e 13 acessórios";
    const result = await plan(facts, {
      shortProductName: "Parafusadeira Furadeira Sem Fio 12V",
      commercialIntent: "proof",
      commercialAngle: "product",
      hook: "⭐ Parafusadeira 12V sem fio com 4.9 de avaliação e 422 vendas",
      benefitLine,
      selectedAttributes: ["Sem fio", "12V", "13 acessórios"],
      optionalProofAngle: null,
    });

    expect(result.benefitLine).toBe(benefitLine);
  });
});
