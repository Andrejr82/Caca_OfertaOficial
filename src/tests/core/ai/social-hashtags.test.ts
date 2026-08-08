import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCopyV2ChannelCopy, type CopyV2Facts } from "@/core/ai/prompt";
import { generateSocialHashtags } from "@/core/ai/social-hashtags";

const facts = (overrides: Partial<CopyV2Facts> = {}): CopyV2Facts => ({
  marketplace: "Shopee",
  productName: "Potes de vidro Mondial",
  category: "Cozinha",
  currentPrice: 39.9,
  originalPrice: 59.9,
  evidence: {},
  ...overrides,
});

describe("dynamic social hashtags", () => {
  it("adds relevant hashtags to Facebook, Instagram and Reels copy", () => {
    const offer = facts();
    for (const channel of ["facebook", "instagram"] as const) {
      const copy = buildCopyV2ChannelCopy(offer, channel);
      expect(copy).toContain("#Shopee");
      expect(copy).toContain("#PotesDeVidro");
      expect(copy).toContain("#Cozinha");
    }
    expect(buildCopyV2ChannelCopy(offer, "instagram")).toMatch(/#Shopee/);
  });

  it("does not add the social block to WhatsApp or Telegram", () => {
    const offer = facts();
    expect(buildCopyV2ChannelCopy(offer, "whatsapp")).not.toMatch(/#Shopee|#PotesDeVidro/);
    expect(buildCopyV2ChannelCopy(offer, "telegram")).not.toMatch(/#Shopee|#PotesDeVidro/);
  });

  it.each([
    ["Shopee", "#Shopee"],
    ["Mercado Livre", "#MercadoLivre"],
    ["Amazon", "#Amazon"],
  ] as const)("uses marketplace %s", (marketplace, expected) => {
    expect(generateSocialHashtags(facts({ marketplace }), "instagram")).toContain(expected);
  });

  it("keeps product context and avoids unrelated categories", () => {
    const games = generateSocialHashtags(facts({ productName: "Controle gamer sem fio", category: "Games" }), "facebook").join(" ");
    const pet = generateSocialHashtags(facts({ productName: "Cama para cachorro", category: "Pet" }), "facebook").join(" ");
    expect(games).toContain("#Games");
    expect(games).not.toMatch(/#Pet|#Automotivo/);
    expect(pet).toContain("#Pet");
    expect(pet).not.toMatch(/#Games|#Automotivo/);
  });

  it("includes a brand only when it is present", () => {
    expect(generateSocialHashtags(facts(), "instagram")).toContain("#Mondial");
    expect(generateSocialHashtags(facts({ productName: "Potes de vidro", evidence: {} }), "instagram")).not.toContain("#Mondial");
  });

  it("deduplicates and sanitizes without URLs or markdown", () => {
    const tags = generateSocialHashtags(facts({ category: "Cozinha cozinha", evidence: { brand: "Mondial" } }), "facebook");
    expect(new Set(tags.map((tag) => tag.toLocaleLowerCase("pt-BR"))).size).toBe(tags.length);
    expect(tags.every((tag) => /^#[\p{L}\p{N}]+$/u.test(tag))).toBe(true);
    expect(tags.join(" ")).not.toMatch(/https?:\/\/|[*_`]/iu);
  });

  it("uses different sets for different offers and distinct channel limits", () => {
    const kitchen = generateSocialHashtags(facts(), "facebook");
    const games = generateSocialHashtags(facts({ productName: "Controle gamer", category: "Games" }), "facebook");
    expect(kitchen).not.toEqual(games);
    expect(generateSocialHashtags(facts(), "facebook").length).toBeGreaterThanOrEqual(generateSocialHashtags(facts(), "instagram").length);
    expect(generateSocialHashtags(facts(), "instagram").length).toBeLessThanOrEqual(8);
  });

  it("keeps hashtag composition out of publishers", () => {
    const publisherSources = [
      "src/app/api/facebook/publish/route.ts",
      "src/app/api/instagram/publish/route.ts",
      "scripts/facebook-auto-publisher.cjs",
    ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n");
    expect(publisherSources).not.toContain("generateSocialHashtags");
    expect(publisherSources).not.toMatch(/hashtags?\s*\+=|appendHashtags|#oferta\s+#/iu);
  });
});
