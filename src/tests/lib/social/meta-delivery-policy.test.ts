import { describe, expect, it } from "vitest";
import {
  buildInstagramStoryHandoffV4,
  INSTAGRAM_STORY_DELIVERY_MODE,
  isInstagramReelsV4Enabled,
} from "@/lib/social/meta-delivery-policy";

const jiesipote = {
  productName: "Mochila Jiesipote À Prova D'água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  category: "Calçados, Roupas e Bolsas",
  currentPrice: 88,
  originalPrice: 269,
  evidence: { mercadolivre_highlights: "BEST_SELLER pos #14" },
  freeShipping: null,
};

describe("Integração Meta — Stories V4 e Reels feature flag", () => {
  it("mantém Reels desligado por padrão e exige opt-in explícito", () => {
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: undefined })).toBe(false);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: "false" })).toBe(false);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: "1" })).toBe(false);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: "true" })).toBe(true);
    expect(isInstagramReelsV4Enabled({ INSTAGRAM_REELS_V4_ENABLED: " TRUE " })).toBe(true);
  });

  it("gera pacote de Stories em 3 telas para postagem manual com sticker", () => {
    const url = "https://caca-oferta-oficial.vercel.app/go/story_jiesipote";
    const handoff = buildInstagramStoryHandoffV4(jiesipote, url);

    expect(handoff.mode).toBe(INSTAGRAM_STORY_DELIVERY_MODE);
    expect(handoff.publishAutomatically).toBe(false);
    expect(handoff.requiresManualLinkSticker).toBe(true);
    expect(handoff.frames).toHaveLength(3);
    expect(handoff.frames.map((frame) => frame.frame)).toEqual([1, 2, 3]);
    expect(handoff.frames[1].text).toContain("Top #14");
    expect(handoff.frames[1].text).toContain("R$ 88,00");
    expect(handoff.frames[2].purpose).toBe("action");
    expect(handoff.trackedUrl).toBe(url);
    expect(handoff.instructions.join(" ")).toMatch(/sticker de link/iu);
  });

  it("falha fechado para URL de Story inválida ou não HTTPS", () => {
    expect(() => buildInstagramStoryHandoffV4(jiesipote, "http://example.com/x")).toThrow(/HTTPS/iu);
    expect(() => buildInstagramStoryHandoffV4(jiesipote, "nao-e-url")).toThrow(/valid tracked URL/iu);
  });
});
