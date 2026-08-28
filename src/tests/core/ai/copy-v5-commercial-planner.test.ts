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
    const recorded = outcome as unknown as CopyV5PlanningOutcome;
    expect(recorded.fallback).toBe(true);
    expect(recorded.reason).toBe("invalid_output");
    expect(recorded.provider).toBe("deterministic-fallback");
  });

  it("prompt declara o planner como único cérebro e exige intenção + benefício", () => {
    expect(COPY_V5_SYSTEM_PROMPT).toContain("único cérebro");
    expect(COPY_V5_SYSTEM_PROMPT).toContain('"commercialIntent"');
    expect(COPY_V5_SYSTEM_PROMPT).toContain('"benefitLine"');
  });

  it("recupera com SOURCE=llm e PROVIDER=groq quando Cerebras retorna HTTP 402", async () => {
    const { OfficialAIProviderRegistry } = await import("@/lib/ai/official/create-official-ai-service");
    const env = {
      LLM_PROVIDER: "cerebras",
      LLM_FALLBACK: "groq",
      CEREBRAS_API_KEY: "cerebras-key",
      GROQ_API_KEY: "groq-key",
    };
    const validLlmPayload = {
      choices: [{
        message: {
          content: JSON.stringify({
            shortProductName: "Chaleira Elétrica Inox",
            commercialIntent: "routine",
            commercialAngle: "saving",
            hook: "☕ Chaleira elétrica inox com desconto",
            benefitLine: "Corpo em inox e 110V",
            selectedAttributes: ["110V"],
            optionalProofAngle: null,
          }),
        },
        finish_reason: "stop",
      }],
    };
    const fetcher = (async (url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes("cerebras")) {
        return new Response("Payment Required", { status: 402 });
      }
      return new Response(JSON.stringify(validLlmPayload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const reg = new OfficialAIProviderRegistry({ env, fetcher, cooldowns: new Map() });
    let outcome: CopyV5PlanningOutcome | null = null;
    const plan = await planCommercialCopyV5(facts, reg.resolve(), {
      onOutcome: (value) => { outcome = value; },
    });

    expect(plan.shortProductName).toBe("Chaleira Elétrica Inox");
    expect(outcome).toEqual({
      source: "llm",
      fallback: false,
      reason: null,
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
  });

  it("processa com sucesso oferta com muitos atributos (ex: Informática) via Groq sem cair em fallback", async () => {
    const informaticaFacts: CopyV5Facts = {
      productName: "Teclado magnético BETTDOW para iPad 2025 A16 Gen10 Air11 (M3) Air4/5 10.9 Air6 11 M2 Pro11 2018-2022 Gen10",
      marketplace: "Shopee",
      category: "informatica_editorial",
      currentPrice: 379,
      originalPrice: null,
      evidence: { sales: 62, rating: 5, attributes: ["iPad A16/Gen10", "Air 11", "Pro 11"] },
    };

    const { OfficialAIProviderRegistry } = await import("@/lib/ai/official/create-official-ai-service");
    const env = {
      LLM_PROVIDER: "cerebras",
      LLM_FALLBACK: "groq",
      CEREBRAS_API_KEY: "cerebras-key",
      GROQ_API_KEY: "groq-key",
    };

    let receivedMaxTokens: number | undefined;
    const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("cerebras")) {
        return new Response("Payment Required", { status: 402 });
      }
      if (init?.body) {
        const parsedBody = JSON.parse(String(init.body)) as { max_completion_tokens?: number };
        receivedMaxTokens = parsedBody.max_completion_tokens;
      }
      return new Response(JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              shortProductName: "Teclado magnético BETTDOW para iPad",
              commercialIntent: "proof",
              commercialAngle: "product",
              hook: "Teclado BETTDOW: 5★ e 62 vendas",
              benefitLine: "Compatível com iPad A16/Gen10, Air 11 e Pro 11",
              selectedAttributes: ["iPad A16/Gen10", "Air 11", "Pro 11"],
              optionalProofAngle: null,
            }),
          },
          finish_reason: "stop",
        }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const reg = new OfficialAIProviderRegistry({ env, fetcher, cooldowns: new Map() });
    let outcome: CopyV5PlanningOutcome | null = null;
    const plan = await planCommercialCopyV5(informaticaFacts, reg.resolve(), {
      onOutcome: (value) => { outcome = value; },
    });

    expect(receivedMaxTokens).toBe(1000);
    expect(plan.shortProductName).toBe("Teclado magnético BETTDOW para iPad");
    expect(outcome).toEqual({
      source: "llm",
      fallback: false,
      reason: null,
      provider: "groq",
      model: "openai/gpt-oss-120b",
    });
  });
});
