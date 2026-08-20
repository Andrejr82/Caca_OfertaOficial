import { describe, expect, it } from "vitest";
import { buildCanonicalCopyV4ChannelDraft } from "@/core/ai/official-ai-service";

const facts = {
  productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  category: "Calçados, Roupas e Bolsas",
  currentPrice: 88,
  originalPrice: 269,
  evidence: { mercadolivre_highlights: "BEST_SELLER pos #14" },
  freeShipping: null,
};

describe("integração canônica Copy V4", () => {
  it("gera WhatsApp/Telegram prontos para a materialização de um único tracked URL", () => {
    for (const channel of ["whatsapp", "telegram"] as const) {
      const copy = buildCanonicalCopyV4ChannelDraft(facts, channel);
      expect(copy).toContain("Top #14");
      expect(copy).toContain("R$ 88,00");
      expect(copy.match(/Conferir o preço atual/gu)).toHaveLength(1);
      expect(copy).toMatch(/👉$/u);
      expect(copy).not.toMatch(/https?:\/\//u);
      expect(copy).not.toMatch(/últimas unidades|só hoje|corre que/iu);
    }
  });

  it("mantém Facebook sem URL no corpo e com CTA de primeiro comentário", () => {
    const copy = buildCanonicalCopyV4ChannelDraft(facts, "facebook");
    expect(copy).toContain("Top #14");
    expect(copy).toContain("R$ 88,00");
    expect(copy).toMatch(/primeiro comentário/iu);
    expect(copy).not.toMatch(/https?:\/\//u);
  });

  it("transforma Instagram em handoff de Stories e não em legenda de Reel", () => {
    const copy = buildCanonicalCopyV4ChannelDraft(facts, "instagram");
    expect(copy).toContain("STORIES V4 · HANDOFF MANUAL");
    expect(copy).toContain("TELA 1/3");
    expect(copy).toContain("TELA 2/3");
    expect(copy).toContain("TELA 3/3");
    expect(copy).toContain("Top #14");
    expect(copy).toContain("R$ 88,00");
    expect(copy).not.toMatch(/https?:\/\//u);
    expect(copy).not.toMatch(/REELS/iu);
  });
});
