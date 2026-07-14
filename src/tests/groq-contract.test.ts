import { describe, expect, it } from "vitest";
import { GeneratedCopySchema } from "@/lib/ai/schemas/generated-copy.schema";
import { generateOfferAnalysis, mapGeneratedCopyToLegacyResult } from "@/lib/ai/groq";

describe("contrato legado isolado", () => {
  it("mantém somente o mapper puro para compatibilidade de tipos", () => {
    const parsed = GeneratedCopySchema.parse({
      strategies: [{
        type: "urgency", headline: "Oferta", hook: "Agora", body: "Produto selecionado",
        cta: "Compre", score: 8
      }],
      winner_type: "urgency",
      justification: "Estratégia coerente",
      hashtags: ["oferta"],
      category: "Geral",
      audience: "Público geral"
    });
    const result = mapGeneratedCopyToLegacyResult(parsed, {
      telegram: "https://example.com/t",
      instagram: "https://example.com/i",
      whatsapp: "https://example.com/w"
    }, {
      id: "offer-1", product_name: "Produto", platform: "Shopee", current_price: 10,
      old_price: 20, category: "Geral"
    } as never);

    expect(result.score).toBe(8);
    expect(result.telegram).toContain("https://example.com/t");
    expect(result.whatsapp).toContain("https://example.com/w");
  });

  it("não permite que o contrato legado alcance provider", async () => {
    await expect(generateOfferAnalysis({} as never, {
      telegram: "t", instagram: "i", whatsapp: "w"
    })).rejects.toThrow("LEGACY_AI_DISABLED: use generateOfficialAI");
  });
});
