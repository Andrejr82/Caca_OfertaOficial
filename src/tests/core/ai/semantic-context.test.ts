import { describe, expect, it } from "vitest";
import { resolveSemanticDomain } from "@/core/ai/semantic-context";
import { generateSocialHashtags } from "@/core/ai/social-hashtags";

describe("semantic context authority", () => {
  it.each([
    ["PC Desktop Intel Core i3", "Pet", "technology"],
    ["TP-Link Archer roteador Wi-Fi", "Pet", "technology"],
    ["Monitor Gamer Samsung", "Pet", "gaming"],
    ["SSD NVMe 1TB", "Pet", "technology"],
    ["Ração Golden para gatos", "Pet", "pet"],
    ["Air Fryer Mondial", "Cozinha", "kitchen"],
  ])("resolve %s pelo domínio do produto", (productName, category, expected) => {
    expect(resolveSemanticDomain(productName, category)).toBe(expected);
  });

  it("não gera hashtag de Pet para roteador classificado em Pet", () => {
    const tags = generateSocialHashtags({
      productName: "TP-Link EX3000 Roteador Wi-Fi",
      marketplace: "Mercado Livre",
      category: "Pet",
      currentPrice: 199,
      originalPrice: null,
      evidence: {},
    }, "instagram");

    expect(tags.join(" ")).not.toMatch(/Pet|CuidadosComPets/iu);
    expect(tags.join(" ")).toMatch(/Tecnologia|Roteador/iu);
  });
});
