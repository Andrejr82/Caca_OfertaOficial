import { describe, expect, it } from "vitest";
import type { CopyV4Facts } from "@/core/ai/copy-v4";
import {
  buildTrendSocialDraft,
  TREND_SOCIAL_CHANNELS,
} from "@/lib/trends/selection-social-drafts";

const facts: CopyV4Facts = {
  productName: "Mochila jiesipote À Prova D’água Reforçada Expansível Cor Preto",
  marketplace: "Mercado Livre",
  category: "Mochilas",
  currentPrice: 79.9,
  originalPrice: 269,
  freeShipping: null,
  evidence: {},
};

const trackedUrl = "https://mercadolivre.com.br/oferta?subid=trend-test";

describe("Trend Social Copy V4 bridge", () => {
  it("creates all four social channels including Telegram", () => {
    expect(TREND_SOCIAL_CHANNELS).toEqual(["facebook", "instagram", "telegram", "whatsapp"]);
  });

  it("creates Instagram as a manual caption without static Story or Reel markers", () => {
    const copy = buildTrendSocialDraft(facts, "instagram", trackedUrl);

    expect(copy).toContain("Link da oferta na bio");
    expect(copy).not.toMatch(/STORIES V4|TELA [123]\/3|sticker|REELS · AGUARDANDO VÍDEO/iu);
    expect(copy).not.toContain(trackedUrl);
  });

  it("keeps Facebook body URL-free and points to the first comment", () => {
    const copy = buildTrendSocialDraft(facts, "facebook", trackedUrl);

    expect(copy).toContain("primeiro comentário");
    expect(copy).not.toContain(trackedUrl);
  });

  it.each(["telegram", "whatsapp"] as const)("materializes exactly one tracked URL for %s", (channel) => {
    const copy = buildTrendSocialDraft(facts, channel, trackedUrl);

    expect(copy.split(trackedUrl)).toHaveLength(2);
    expect(copy).toContain("👉 Achado no Mercado Livre:");
  });
});
