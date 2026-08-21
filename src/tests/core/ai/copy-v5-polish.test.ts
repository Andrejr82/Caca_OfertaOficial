import { describe, expect, it } from "vitest";
import type { CopyV5Facts, CopyV5Plan } from "@/core/ai/copy-v5-types";
import { polishCopyV5Facts, polishCopyV5Plan } from "@/core/ai/copy-v5-polish";

function facts(overrides: Partial<CopyV5Facts> = {}): CopyV5Facts {
  return {
    productName: 'Smart TV LG 43" Full HD Processador A5 Ger6 AI Alexa webOS',
    shortName: null,
    marketplace: "Mercado Livre",
    category: "TV",
    currentPrice: 1529,
    originalPrice: 2290,
    evidence: {},
    freeShipping: null,
    ...overrides,
  };
}

function plan(overrides: Partial<CopyV5Plan> = {}): CopyV5Plan {
  return {
    shortProductName: 'Smart TV LG 43" Full HD AI Alexa webOS Processador α5',
    commercialAngle: "high_saving",
    hook: '🔥 Smart TV LG 43" Full HD AI Alexa webOS Processador α5 com mais de R$ 700 de economia',
    selectedAttributes: ["Alexa", "webOS", "Processador α5"],
    optionalProofAngle: null,
    ...overrides,
  };
}

describe("Copy V5 commercial polish", () => {
  it("encurta TV, limita hook e remove atributos redundantes", () => {
    const output = polishCopyV5Plan(plan(), facts());
    expect(output.shortProductName).toBe('Smart TV LG 43" Full HD');
    expect(output.hook).toBe('🔥 Mais de R$ 700 de economia — LG 43"');
    expect(output.hook.length).toBeLessThanOrEqual(72);
    expect(output.selectedAttributes).toEqual(["Alexa", "webOS", "Processador A5"]);
  });

  it("remove no/na de hooks de desconto profundo", () => {
    const f = facts({
      productName: 'Smartwatch HUAWEI Band 10 Tela AMOLED 1,47"',
      category: "wearable",
      currentPrice: 199,
      originalPrice: 659,
    });
    const output = polishCopyV5Plan(plan({
      shortProductName: 'Smartwatch HUAWEI Band 10 Tela AMOLED 1,47"',
      commercialAngle: "deep_discount",
      hook: '🚨 70% OFF no/na Smartwatch HUAWEI Band 10 Tela AMOLED 1,47"',
      selectedAttributes: [],
    }), f);
    expect(output.shortProductName).toBe("Smartwatch HUAWEI Band 10");
    expect(output.hook).toBe("🚨 70% OFF — HUAWEI Band 10");
    expect(output.hook).not.toMatch(/no\/na/iu);
  });

  it("formata economia de quatro dígitos no hook", () => {
    const f = facts({
      productName: "Smartphone Samsung Galaxy A55 5G 256GB Tela 6,6 8GB RAM",
      category: "smartphone",
      currentPrice: 1899,
      originalPrice: 2999,
    });
    const output = polishCopyV5Plan(plan({
      shortProductName: "Smartphone Samsung Galaxy A55 5G 256GB Tela 6,6 8GB RAM",
      commercialAngle: "high_saving",
      hook: "🔥 Galaxy A55 com mais de R$ 1100 de economia",
      selectedAttributes: ["5G", "256 GB", "8 GB RAM"],
    }), f);
    expect(output.hook).toContain("R$ 1.100");
    expect(output.shortProductName).toBe("Smartphone Samsung Galaxy A55 5G 256GB");
  });

  it("remove Oficial duplicado do nome da loja sem apagar o fato", () => {
    const output = polishCopyV5Facts(facts({
      evidence: {
        official_store: true,
        seller_name: "LG Oficial",
        official_store_name: "LG Oficial",
      },
    }));
    expect(output.evidence?.seller_name).toBe("LG");
    expect(output.evidence?.official_store_name).toBe("LG");
    expect(output.evidence?.official_store).toBe(true);
  });

  it("encurta ar-condicionado sem inventar atributos", () => {
    const f = facts({
      productName: "Ar Condicionado Inverter Philco 9000 BTUs Frio 220V PAC9FT",
      category: "ar condicionado",
      currentPrice: 1738,
      originalPrice: 2499,
    });
    const output = polishCopyV5Plan(plan({
      shortProductName: "Ar Condicionado Inverter Philco 9000 BTUs Frio 220V PAC9FT",
      commercialAngle: "high_saving",
      hook: "🔥 Ar Condicionado Inverter Philco 9000 BTUs Frio 220V com mais de R$ 700 de economia",
      selectedAttributes: ["Inverter", "9000 BTUs", "Frio", "220V"],
    }), f);
    expect(output.shortProductName).toBe("Ar Condicionado Philco 9000 BTUs");
    expect(output.hook).toBe("🔥 Mais de R$ 700 de economia — Philco Inverter");
    expect(output.selectedAttributes).toEqual(["Inverter", "Frio", "220V"]);
  });
});
