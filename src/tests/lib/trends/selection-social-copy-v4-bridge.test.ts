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

  it("creates Instagram as the canonical manual Stories handoff", () => {
    const copy = buildTrendSocialDraft(facts, "instagram", trackedUrl);

    expect(copy).toMatch(/^STORIES V4 · HANDOFF MANUAL/u);
    expect(copy).toContain("TELA 1/3");
    expect(copy).toContain("TELA 2/3");
    expect(copy).toContain("TELA 3/3");
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
    expect(copy).toContain("👉 Conferir o preço atual");
  });
});
