import { describe, expect, it } from "vitest";
import { COPY_V5_SYSTEM_PROMPT, planCommercialCopyV5, type CopyV5PlanningOutcome } from "@/core/ai/copy-v5-planner";
import type { AIProviderPort } from "@/core/ai/ports";
import type { CopyV5Facts } from "@/core/ai/copy-v5-types";

const facts: CopyV5Facts = {
  productName: "Chaleira Elétrica 1.8 Litros Inox 110V",
  marketplace: "Amazon",
  category: "Eletrodomésticos",
  currentPrice: 39.9,
  originalPrice: 59.9,
  evidence: { material: "Inox", voltage: "110V" },
};

function provider(content: unknown): AIProviderPort {
  return {
    name: "groq",
    model: "openai/gpt-oss-120b",
    async generate() {
      return { content, provider: "groq", model: "openai/gpt-oss-120b", latencyMs: 1 };
    },
  };
}

describe("Copy V5 commercial planner", () => {
  it("define intenção comercial e benefício factual no mesmo plano", async () => {
    const plan = await planCommercialCopyV5(facts, provider({
      shortProductName: "Chaleira Elétrica 1.8L Inox",
      commercialIntent: "routine",
      commercialAngle: "saving",
      hook: "☕ Chaleira inox para a rotina de café e chá",
      benefitLine: "Corpo em inox e capacidade de 1.8 litros",
      selectedAttributes: ["110V"],
      optionalProofAngle: null,
    }));

    expect(plan.commercialIntent).toBe("routine");
    expect(plan.benefitLine).toBe("Corpo em inox e capacidade de 1.8 litros");
  });

  it("remove benefício sem suporte factual", async () => {
    const plan = await planCommercialCopyV5(facts, provider({
      shortProductName: "Chaleira Elétrica",
      commercialIntent: "desire",
      commercialAngle: "product",
      hook: "☕ Chaleira elétrica para água quente",
      benefitLine: "Economiza metade da energia e ferve em 30 segundos",
      selectedAttributes: ["110V"],
      optionalProofAngle: null,
    }));

    expect(plan.benefitLine).toBeNull();
  });

  it("reporta LLM real com provider/model sem fallback", async () => {
    let outcome: CopyV5PlanningOutcome | null = null;
    await planCommercialCopyV5(facts, provider({
      shortProductName: "Chaleira Elétrica",
      commercialIntent: "saving",
      commercialAngle: "saving",
      hook: "☕ Chaleira elétrica com economia no preço",
      benefitLine: null,
      selectedAttributes: ["110V"],
      optionalProofAngle: null,
    }), { onOutcome: (value) => { outcome = value; } });

    expect(outcome).toEqual({
      source: "llm",
      fallback: false,
      reason: null,
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
  });

  it("reporta fallback explícito quando não há provider", async () => {
    let outcome: CopyV5PlanningOutcome | null = null;
    const plan = await planCommercialCopyV5(facts, null, { onOutcome: (value) => { outcome = value; } });

    expect(plan.hook).toBeTruthy();
    expect(outcome).toEqual({
      source: "deterministic-fallback",
      fallback: true,
      reason: "no_provider",
      provider: "deterministic-fallback",
      model: "copy-v5-fallback",
    });
  });

  it("reporta invalid_json sem voltar para V2/V3", async () => {
    let outcome: CopyV5PlanningOutcome | null = null;
    const plan = await planCommercialCopyV5(facts, provider('{"hook":'), { onOutcome: (value) => { outcome = value; } });

    expect(plan.hook).toBeTruthy();
    expect(outcome?.fallback).toBe(true);
    expect(outcome?.reason).toBe("invalid_output");
    expect(outcome?.provider).toBe("deterministic-fallback");
  });

  it("prompt declara o planner como único cérebro e exige intenção + benefício", () => {
    expect(COPY_V5_SYSTEM_PROMPT).toContain("único cérebro");
    expect(COPY_V5_SYSTEM_PROMPT).toContain('"commercialIntent"');
    expect(COPY_V5_SYSTEM_PROMPT).toContain('"benefitLine"');
  });
});
