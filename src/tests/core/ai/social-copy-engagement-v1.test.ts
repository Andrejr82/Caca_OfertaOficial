import { describe, expect, it } from "vitest";
import { buildCopyV2ChannelCopy, buildCopyV3ChannelCopy } from "@/core/ai/prompt";
import { materializeDraftContent } from "@/lib/ai/official/supabase-official-ai-adapter";

const facts = {
  marketplace: "Mercado Livre",
  productName: "Cadeira Gamer Nitro Ergonômica Estofado Couro Sintético Reclinável Altura Ajustável Apoio Para Pés Cor Cinza",
  category: "Games",
  currentPrice: 479.9,
  originalPrice: 899.9,
  evidence: {},
};

describe("social copy engagement v1", () => {
  it("abre a copy com produto + vantagem real, sem chamadas genéricas", () => {
    const copy = buildCopyV2ChannelCopy(facts, "facebook");
    const first = copy.split("\n\n")[0];
    expect(first).toMatch(/Cadeira Gamer|47%/iu);
    expect(first).not.toMatch(/Oferta em destaque|Boa opção para sua rotina|Seleção oficial do dia/iu);
  });

  it("usa CTA curto orientado à ação sem falsa urgência", () => {
    const whatsapp = buildCopyV3ChannelCopy(facts, "whatsapp");
    expect(whatsapp).toMatch(/Ver oferta|Veja a oferta/iu);
    expect(whatsapp).not.toMatch(/Corre pra conferir|últimas unidades|só hoje|corre que/iu);
  });

  it("não termina título público em conectivo ou pontuação quebrada", () => {
    const copy = buildCopyV2ChannelCopy({ ...facts, productName: "Mesa de Jantar Industrial 120x80 cm com Base em Metalon e Tampo em Lâmina Mel para Sala" }, "facebook");
    const title = copy.split("\n\n").find((block) => block.startsWith("🛍️")) ?? "";
    expect(title).not.toMatch(/\b(?:com|para|e|de|da|do)[,.:;!?]?$/iu);
  });

  it("materializa URL do Facebook antes das hashtags", () => {
    const raw = [
      "🔥 47% OFF: Cadeira Gamer Nitro",
      "👉 Veja a oferta no primeiro comentário 👇",
      "#CadeiraGamer #MercadoLivre #Oferta",
    ].join("\n\n");
    const url = "https://caca-oferta-oficial.vercel.app/go/fb_offer";
    const content = materializeDraftContent("facebook", raw, url);
    expect(content.indexOf(url)).toBeGreaterThan(content.indexOf("👉"));
    expect(content.indexOf(url)).toBeLessThan(content.indexOf("#CadeiraGamer"));
  });
});
