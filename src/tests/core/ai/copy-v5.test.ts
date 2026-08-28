import { describe, expect, it } from "vitest";
import {
  validateCopyV5Plan,
  validateHook,
  validateAttributes,
  validateProofAngle,
  cleanProductName,
  PROHIBITED_WORDS_REGEX,
} from "@/core/ai/copy-v5-validator";
import {
  renderCopyV5ChannelCopy,
  renderPriceBlock,
  buildCopyV5Blocks,
  getMarketplaceCtaPrefix,
} from "@/core/ai/copy-v5-renderer";
import type { CopyV5Facts, CopyV5Plan } from "@/core/ai/copy-v5-types";

describe("Copy V5 — Hybrid Commercial Architecture", () => {
  it("CASO 1 — Smart TV LG com De/Por em linhas separadas e atributos factuais", () => {
    const facts: CopyV5Facts = {
      productName: "Smart TV LG 43 Full HD Processador A5 Ger6 AI Alexa webOS",
      marketplace: "Mercado Livre",
      category: "TV e Áudio",
      currentPrice: 1529,
      originalPrice: 2290,
      evidence: {},
    };

    const candidatePlan: CopyV5Plan = {
      shortProductName: "Smart TV LG 43\" Full HD",
      commercialAngle: "high_saving",
      hook: "🔥 LG 43\" com mais de R$ 700 de economia",
      selectedAttributes: ["Alexa", "webOS", "Processador A5"],
      optionalProofAngle: null,
    };

    const validated = validateCopyV5Plan(candidatePlan, facts);
    expect(validated.shortProductName).toBe("Smart TV LG 43\" Full HD");
    expect(validated.hook).toBe("🔥 LG 43\" com mais de R$ 700 de economia");
    expect(validated.selectedAttributes).toEqual(["Alexa", "webOS", "Processador A5"]);

    const url = "https://caca-oferta-oficial.vercel.app/go/tv_lg";
    const rendered = renderCopyV5ChannelCopy(validated, facts, "whatsapp", url);

    expect(rendered.feed).toContain("De R$ 2.290,00\nPor R$ 1.529,00");
    expect(rendered.feed).not.toMatch(/De R\$ 2\.290,00 por R\$ 1\.529,00/i);
    expect(rendered.feed).toContain("Alexa • webOS • Processador A5");
    expect(rendered.feed).toContain(`👉 Ver no Mercado Livre:\n${url}`);
  });

  it("CASO 2 — HUAWEI Band 10 com hook comercial variável", () => {
    const facts: CopyV5Facts = {
      productName: "Smartwatch HUAWEI Band 10",
      marketplace: "Mercado Livre",
      category: "Smartwatches",
      currentPrice: 199,
      originalPrice: 659,
      evidence: {},
    };

    const candidatePlan: CopyV5Plan = {
      shortProductName: "Smartwatch HUAWEI Band 10",
      commercialAngle: "price_threshold",
      hook: "⌚ HUAWEI Band 10 por menos de R$ 200",
      selectedAttributes: [],
      optionalProofAngle: null,
    };

    const validated = validateCopyV5Plan(candidatePlan, facts);
    expect(validated.hook).toBe("⌚ HUAWEI Band 10 por menos de R$ 200");

    const url = "https://caca-oferta-oficial.vercel.app/go/huawei_band";
    const rendered = renderCopyV5ChannelCopy(validated, facts, "whatsapp", url);

    expect(rendered.feed).toContain("De R$ 659,00\nPor R$ 199,00");
    expect(rendered.feed).not.toMatch(/🔥 (?:69|70)% OFF/);
    expect(rendered.feed).toContain(`👉 Ver no Mercado Livre:\n${url}`);
  });

  it("CASO 3 — Sem desconto com preço único e sem hook artificial de promoção", () => {
    const facts: CopyV5Facts = {
      productName: "Fone JBL Tune 520BT Bluetooth Sem fio",
      marketplace: "Amazon",
      category: "Áudio",
      currentPrice: 219.9,
      originalPrice: null,
      evidence: {},
    };

    const validated = validateCopyV5Plan(null, facts);
    expect(validated.hook).toMatch(/JBL Tune 520BT/);
    expect(validated.hook).not.toMatch(/OFF|economia|desconto/i);

    const url = "https://caca-oferta-oficial.vercel.app/go/jbl_tune";
    const rendered = renderCopyV5ChannelCopy(validated, facts, "whatsapp", url);

    expect(rendered.feed).toContain("R$ 219,90");
    expect(rendered.feed).not.toContain("De R$");
    expect(rendered.feed).not.toContain("Por R$");
    expect(rendered.feed).toContain("Bluetooth • Sem fio");
    expect(rendered.feed).toContain(`👉 Ver na Amazon:\n${url}`);
  });

  it("CASO 4 — LLM inventa 'últimas unidades' e validator rejeita", () => {
    const facts: CopyV5Facts = {
      productName: "Mochila Impermeável Reforçada",
      marketplace: "Shopee",
      category: "Malas e Bolsas",
      currentPrice: 89.9,
      originalPrice: 150,
      evidence: {},
    };

    const badPlan: CopyV5Plan = {
      shortProductName: "Mochila Impermeável",
      commercialAngle: "standard",
      hook: "🔥 Corre que são as últimas unidades!",
      selectedAttributes: ["À prova d'água"],
      optionalProofAngle: null,
    };

    const validated = validateCopyV5Plan(badPlan, facts);
    expect(validated.hook).not.toMatch(/últimas unidades|corre/i);
    expect(PROHIBITED_WORDS_REGEX.test(validated.hook)).toBe(false);
  });

  it("CASO 5 — LLM inventa adjetivos 'rápido e potente' e validator rejeita", () => {
    const facts: CopyV5Facts = {
      productName: "Notebook Lenovo 8GB RAM 256GB SSD",
      marketplace: "Mercado Livre",
      category: "Informática",
      currentPrice: 1999,
      originalPrice: 2899,
      evidence: {},
    };

    const badPlan: CopyV5Plan = {
      shortProductName: "Notebook Lenovo",
      commercialAngle: "standard",
      hook: "💻 O notebook mais rápido e potente da categoria!",
      selectedAttributes: ["Super potente", "Ultra rápido"],
      optionalProofAngle: null,
    };

    const validated = validateCopyV5Plan(badPlan, facts);
    expect(validated.hook).not.toMatch(/rápido|potente|melhor/i);
    expect(validated.selectedAttributes).not.toContain("Super potente");
    expect(validated.selectedAttributes).not.toContain("Ultra rápido");
  });

  it("CASO 6 — Atributo inexistente nos fatos é removido", () => {
    const facts: CopyV5Facts = {
      productName: "Caixa de Som Portátil Bluetooth",
      marketplace: "Amazon",
      category: "Áudio",
      currentPrice: 120,
      originalPrice: 200,
      evidence: {},
    };

    const planWithFakeAttr: CopyV5Plan = {
      shortProductName: "Caixa de Som Portátil",
      commercialAngle: "saving",
      hook: "🔥 Caixa de Som Portátil com 40% OFF",
      selectedAttributes: ["Resolução 8K", "Bateria 100 horas", "Bluetooth"],
      optionalProofAngle: null,
    };

    const validated = validateCopyV5Plan(planWithFakeAttr, facts);
    expect(validated.selectedAttributes).not.toContain("Resolução 8K");
    expect(validated.selectedAttributes).not.toContain("Bateria 100 horas");
    expect(validated.selectedAttributes).toContain("Bluetooth");
  });

  it("CASO 7 — WhatsApp renderiza exatamente 1 URL rastreada", () => {
    const facts: CopyV5Facts = {
      productName: "Cafeteira Nespresso Essenza Mini 220V",
      marketplace: "Mercado Livre",
      category: "Eletroportáteis",
      currentPrice: 389,
      originalPrice: 549,
      evidence: {},
    };

    const plan = validateCopyV5Plan(null, facts);
    const url = "https://caca-oferta-oficial.vercel.app/go/nespresso";
    const rendered = renderCopyV5ChannelCopy(plan, facts, "whatsapp", url);

    expect(rendered.feed.match(/https:\/\//g)).toHaveLength(1);
    expect(rendered.feed).toContain(`👉 Ver no Mercado Livre:\n${url}`);
  });

  it("CASO 8 — Facebook possui 0 URL no corpo e URL no primeiro comentário", () => {
    const facts: CopyV5Facts = {
      productName: "Fritadeira Sem Óleo Mondial 4 Litros 1500W",
      marketplace: "Magalu",
      category: "Cozinha",
      currentPrice: 279,
      originalPrice: 399,
      evidence: {},
    };

    const plan = validateCopyV5Plan(null, facts);
    const url = "https://caca-oferta-oficial.vercel.app/go/mondial";
    const rendered = renderCopyV5ChannelCopy(plan, facts, "facebook", url);

    expect(rendered.feed).not.toMatch(/https?:\/\//);
    expect(rendered.feed).toContain("👉 Veja o preço, condições e disponibilidade no primeiro comentário.");
    expect(rendered.feed).not.toContain("👉 Link da oferta no primeiro comentário. 👇");
    expect(rendered.firstComment).toBe(`👉 Link da oferta: ${url}`);
  });

  it("CASO 9 — Instagram possui 0 URL no corpo e aponta para o link da bio", () => {
    const facts: CopyV5Facts = {
      productName: "Kit Pincéis de Maquiagem Profissional",
      marketplace: "Shein",
      category: "Beleza",
      currentPrice: 39.9,
      originalPrice: 79.9,
      evidence: {},
    };

    const plan = validateCopyV5Plan(null, facts);
    const url = "https://caca-oferta-oficial.vercel.app/go/pinceis";
    const rendered = renderCopyV5ChannelCopy(plan, facts, "instagram", url);

    expect(rendered.feed).not.toMatch(/https?:\/\//);
    expect(rendered.feed).toContain("👉 Veja o preço, condições e disponibilidade no link da bio.");
    expect(rendered.feed).not.toContain("🔎 Link da oferta na bio. 👇");
  });

  it("CASO 10 — Rating 5/5 sem volume relevante não é exibido", () => {
    const facts: CopyV5Facts = {
      productName: "Organizador de Cabos Autoadesivo",
      marketplace: "Shopee",
      category: "Casa",
      currentPrice: 15,
      originalPrice: null,
      evidence: { rating: 5 },
    };

    const validated = validateCopyV5Plan(null, facts);
    expect(validated.optionalProofAngle).toBeNull();

    const rendered = renderCopyV5ChannelCopy(validated, facts, "whatsapp", "https://caca-oferta-oficial.vercel.app/go/cabos");
    expect(rendered.feed).not.toMatch(/Avaliação 5\/5|⭐/);
  });

  it("VALIDAÇÃO DE VARIEDADE — 10 ofertas diferentes geram hooks e estruturas variadas", () => {
    const sampleOffers: CopyV5Facts[] = [
      {
        productName: "Smart TV LG 43 Full HD Processador A5",
        marketplace: "Mercado Livre",
        category: "TV",
        currentPrice: 1529,
        originalPrice: 2290,
      },
      {
        productName: "Smartwatch HUAWEI Band 10",
        marketplace: "Mercado Livre",
        category: "Smartwatch",
        currentPrice: 199,
        originalPrice: 659,
      },
      {
        productName: "Fone JBL Tune 520BT Bluetooth Sem fio",
        marketplace: "Amazon",
        category: "Áudio",
        currentPrice: 219.9,
        originalPrice: null,
      },
      {
        productName: "Ar Condicionado Inverter Philco 9000 BTUs 220V",
        marketplace: "Shopee",
        category: "Climatização",
        currentPrice: 1738,
        originalPrice: 2499,
      },
      {
        productName: "Jogo de Churrasco Tramontina Inox 3 Peças",
        marketplace: "Amazon",
        category: "Cozinha",
        currentPrice: 89.9,
        originalPrice: 149.9,
      },
      {
        productName: "Kit Body Splash Desodorante 200ml",
        marketplace: "Shopee",
        category: "Beleza",
        currentPrice: 79.9,
        originalPrice: 119.9,
        evidence: { coupon: "BELEZA15" },
      },
      {
        productName: "Mochila Expansível À Prova D'água",
        marketplace: "Mercado Livre",
        category: "Bolsas",
        currentPrice: 88,
        originalPrice: 269,
        freeShipping: true,
      },
      {
        productName: "Organizador Multiuso Transparente",
        marketplace: "Magalu",
        category: "Casa",
        currentPrice: 29.9,
        originalPrice: null,
      },
      {
        productName: "Smartphone Samsung Galaxy A55 5G 256GB",
        marketplace: "Mercado Livre",
        category: "Celulares",
        currentPrice: 1899,
        originalPrice: 2999,
        evidence: { is_official_store: true, seller_name: "Samsung Oficial" },
      },
      {
        productName: "Air Fryer Mondial 5 Litros 1900W 220V",
        marketplace: "Amazon",
        category: "Cozinha",
        currentPrice: 349,
        originalPrice: 529,
        evidence: { reviews_count: 8500, rating: 4.8 },
      },
    ];

    const hooks = new Set<string>();
    for (const offer of sampleOffers) {
      const plan = validateCopyV5Plan(null, offer);
      expect(plan.hook).toBeTruthy();
      expect(PROHIBITED_WORDS_REGEX.test(plan.hook)).toBe(false);
      hooks.add(plan.hook);

      const rendered = renderCopyV5ChannelCopy(plan, offer, "whatsapp", `https://caca-oferta-oficial.vercel.app/go/${encodeURIComponent(offer.productName.slice(0, 10))}`);

      if (offer.originalPrice && offer.originalPrice > offer.currentPrice) {
        expect(rendered.feed).toMatch(/De R\$ [\d.,]+\nPor R\$ [\d.,]+/);
        expect(rendered.feed).not.toMatch(/De R\$ [\d.,]+ [pP]or R\$ [\d.,]+/);
      }
    }

    expect(hooks.size).toBe(sampleOffers.length);
  });
});
