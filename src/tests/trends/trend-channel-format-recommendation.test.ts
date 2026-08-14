import { describe, expect, it } from "vitest";
import type { AIProviderPort } from "@/core/ai/ports";
import type { TrendOpportunity } from "@/core/trends/types";
import { recommendTrendChannelAndFormat } from "@/core/ai/trend-channel-format-recommender";
import { buildTrendRecommendationRow } from "@/lib/trends/recommendation-persistence";

const opportunity: TrendOpportunity = {
  id: "3bd6ae18-81a1-42ab-8c0a-b91857c16703",
  signalId: "signal-1",
  classificationId: null,
  offerId: "3fd7ef82-7444-44c7-8c57-defb18886e72",
  marketplace: "Shopee",
  normalizedProductTerm: "Escova Secadora Britânia BELLA01",
  matchStatus: "matched",
  matchReason: "Identidade validada.",
  matchConfidence: 100,
  currentPrice: 94.9,
  oldPrice: null,
  score: null,
  status: "matched",
  experimentId: null,
  strategyVersion: "daily-commercial-radar-v1",
  finalDecision: null
};

function providerWith(content: unknown): AIProviderPort {
  return {
    name: "groq",
    model: "openai/gpt-oss-120b",
    generate: async () => ({ content, provider: "groq", model: "openai/gpt-oss-120b", latencyMs: 1 })
  };
}

function providerWithSequence(contents: unknown[], prompts: string[]) : AIProviderPort {
  let index = 0;
  return {
    name: "groq",
    model: "openai/gpt-oss-120b",
    generate: async (request) => {
      prompts.push(request.prompt.system);
      const content = contents[index++];
      return { content, provider: "groq", model: "openai/gpt-oss-120b", latencyMs: 1 };
    }
  };
}

describe("trend channel and format recommendation", () => {
  it("returns a structured recommendation for a valid matched opportunity", async () => {
    const result = await recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Escova Secadora Britânia 4 em 1 1300W Bivolt BELLA01 Bivolt",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWith({
      channel: "Instagram",
      format: "vídeo",
      rationale: "O produto tem demonstração visual clara e preço observado no radar.",
      hypothesis: "Uma demonstração curta pode facilitar a compreensão do uso.",
      confidence: 82
    }));

    expect(result).toMatchObject({
      channel: "Instagram",
      format: "vídeo",
      rationale: expect.any(String),
      hypothesis: expect.any(String),
      confidence: 82,
      strategyVersion: "trend-channel-format-v1",
      provider: "groq",
      model: "openai/gpt-oss-120b"
    });
  });

  it("normalizes the provider's English video alias to the existing contract value", async () => {
    const result = await recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWith({
      channel: "Instagram",
      format: "video",
      rationale: "O produto permite demonstração visual.",
      hypothesis: "Uma demonstração pode facilitar a compreensão do uso.",
      confidence: 80
    }));
    expect(result?.format).toBe("vídeo");
  });

  it("fails closed for invalid channel or format", async () => {
    await expect(recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWith({ channel: "TikTok", format: "live", rationale: "x", confidence: 90 }))).resolves.toBeNull();
  });

  it("fails closed when the model invents performance metrics", async () => {
    await expect(recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWith({
      channel: "Instagram",
      format: "vídeo",
      rationale: "Produto demonstrável.",
      hypothesis: "Aumentará os cliques e as conversões.",
      confidence: 80
    }))).resolves.toBeNull();
  });

  it("retries once after invalid output and accepts a valid second response", async () => {
    const prompts: string[] = [];
    const result = await recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWithSequence([
      { channel: "Instagram", format: "vídeo", rationale: "Aumentará o CTR.", hypothesis: "x", confidence: 80 },
      { channel: "Instagram", format: "vídeo", rationale: "O produto tem demonstração visual clara.", hypothesis: "Uma demonstração pode facilitar a compreensão do uso.", confidence: 80 }
    ], prompts));

    expect(result?.channel).toBe("Instagram");
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Remova qualquer menção");
  });

  it("uses at most one retry and remains fail-closed when both outputs are invalid", async () => {
    const prompts: string[] = [];
    const result = await recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWithSequence([
      { channel: "Instagram", format: "vídeo", rationale: "Aumentará o CTR.", hypothesis: "x", confidence: 80 },
      { channel: "TikTok", format: "live", rationale: "Ainda inválido.", hypothesis: "y", confidence: 80 },
      { channel: "WhatsApp", format: "imagem", rationale: "Não deve ser usado.", hypothesis: "z", confidence: 80 }
    ], prompts));

    expect(result).toBeNull();
    expect(prompts).toHaveLength(2);
  });

  it("fails closed when provider fails or opportunity is not matched", async () => {
    const failingProvider: AIProviderPort = {
      name: "groq",
      model: "openai/gpt-oss-120b",
      generate: async () => { throw new Error("provider unavailable"); }
    };
    await expect(recommendTrendChannelAndFormat(opportunity, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, failingProvider)).resolves.toBeNull();
    await expect(recommendTrendChannelAndFormat({ ...opportunity, matchStatus: "no_match", offerId: null }, {
      offerTitle: "Produto real",
      evidenceStatus: "verified",
      provenance: "external_radar"
    }, providerWith({ channel: "WhatsApp", format: "imagem", rationale: "x", confidence: 90 }))).resolves.toBeNull();
  });

  it("builds a pending human-approval row tied to the exact opportunity and strategy", () => {
    const row = buildTrendRecommendationRow("user-1", opportunity, {
      channel: "WhatsApp",
      format: "imagem",
      rationale: "Produto de utilidade com preço observado.",
      hypothesis: "Uma oferta visual pode comunicar o benefício rapidamente.",
      confidence: 76,
      strategyVersion: "trend-channel-format-v1",
      provider: "groq",
      model: "openai/gpt-oss-120b"
    });

    expect(row).toMatchObject({
      user_id: "user-1",
      opportunity_id: opportunity.id,
      offer_id: opportunity.offerId,
      status: "recommended",
      strategy_version: "trend-channel-format-v1",
      ai_provider: "groq",
      ai_model: "openai/gpt-oss-120b"
    });
  });

  it("does not build a row for a no-match opportunity", () => {
    expect(() => buildTrendRecommendationRow("user-1", { ...opportunity, offerId: null, matchStatus: "no_match" }, {
      channel: "WhatsApp",
      format: "imagem",
      rationale: "x",
      hypothesis: "y",
      confidence: 50,
      strategyVersion: "trend-channel-format-v1",
      provider: "groq",
      model: "model"
    })).toThrow();
  });
});
