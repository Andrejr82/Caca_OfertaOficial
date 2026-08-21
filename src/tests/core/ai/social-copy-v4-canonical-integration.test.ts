import { describe, expect, it } from "vitest";
import { buildCanonicalCopyV4ChannelDraft } from "@/core/ai/official-ai-service";
import { materializeDraftContent } from "@/lib/ai/official/supabase-official-ai-adapter";
import { assertInstagramV4PublicationAllowed } from "@/lib/social/meta-publication-guard";

const facts = {
  productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  category: "Calçados, Roupas e Bolsas",
  currentPrice: 88,
  originalPrice: 269,
  freeShipping: null,
  evidence: {
    mercadolivre_highlights: "BEST_SELLER pos #14",
  },
};

describe("Social Copy V4 — integração canônica", () => {
  it("materializa WhatsApp com exatamente um tracked URL", () => {
    const raw = buildCanonicalCopyV4ChannelDraft(facts, "whatsapp");
    const trackedUrl = "https://caca-oferta-oficial.vercel.app/go/wa_jiesipote";
    const materialized = materializeDraftContent("whatsapp", raw, trackedUrl);

    expect(materialized).toContain("Top #14");
    expect(materialized).toContain("R$ 88,00");
    expect(materialized.match(/https:\/\//gu)).toHaveLength(1);
    expect(materialized).toContain(trackedUrl);
    expect(materialized).not.toMatch(/só hoje|últimas unidades|corre que/iu);
  });

  it("mantém Facebook sem URL no corpo e com orientação ao primeiro comentário", () => {
    const raw = buildCanonicalCopyV4ChannelDraft(facts, "facebook");
    const materialized = materializeDraftContent(
      "facebook",
      raw,
      "https://caca-oferta-oficial.vercel.app/go/fb_jiesipote",
    );

    expect(materialized).toMatch(/primeiro comentário/iu);
    expect(materialized).not.toMatch(/https?:\/\//u);
  });

  it("mantém Instagram como legenda manual e fora de Stories/Reels", () => {
    const raw = buildCanonicalCopyV4ChannelDraft(facts, "instagram");
    const materialized = materializeDraftContent(
      "instagram",
      raw,
      "https://caca-oferta-oficial.vercel.app/go/ig_jiesipote",
    );

    expect(materialized).toContain("Top #14");
    expect(materialized).toContain("R$ 88,00");
    expect(materialized).toContain("Conferir o preço atual");
    expect(materialized).not.toMatch(/STORIES V4|TELA [123]\/3|sticker|REELS · AGUARDANDO VÍDEO/iu);
    expect(materialized).not.toMatch(/https?:\/\//u);
  });

  it("mantém legenda manual compatível com transporte de Feed", () => {
    const raw = buildCanonicalCopyV4ChannelDraft(facts, "instagram");
    expect(() => assertInstagramV4PublicationAllowed({
      content: raw,
      mediaType: "FEED",
      reelsEnabled: false,
    })).not.toThrow();
  });
});
