import { describe, expect, it } from "vitest";
import { buildCopyV2ChannelCopy, type CopyV2Facts } from "@/core/ai/prompt";
import { assertOfficialCopy, findLegacyOfficialCopyPattern } from "@/core/ai/official-copy-policy";

const facts: CopyV2Facts = {
  marketplace: "Shopee",
  productName: "Shampoo hidratante",
  currentPrice: 14.99,
  originalPrice: null,
  category: "Beleza",
  sellerName: null,
  freeShipping: null,
  marketplaceMetrics: null,
};

describe("official copy authority", () => {
  it.each(["whatsapp", "telegram", "facebook", "instagram"] as const)("does not render legacy copy for %s", (channel) => {
    const content = buildCopyV2ChannelCopy(facts, channel);
    expect(findLegacyOfficialCopyPattern(content)).toBeNull();
    expect(content).not.toMatch(/Uma opção por|Achado na Shopee|Preço atual:/iu);
  });

  it("rejects legacy content before posts.content persistence", () => {
    expect(() => assertOfficialCopy("⭐ Uma opção por R$ 14,99", "whatsapp")).toThrow("Legacy copy pattern rejected");
    expect(() => assertOfficialCopy("🧴 Achado na Shopee", "telegram")).toThrow("Legacy copy pattern rejected");
    expect(() => assertOfficialCopy("✅ Preço atual: R$ 14,99", "instagram")).toThrow("Legacy copy pattern rejected");
  });

  it("preserves the official content instead of rebuilding it", () => {
    const official = "✨ Oferta em destaque\n\n🧴 Shampoo hidratante\n\n✅ Valor confirmado: R$ 14,99";
    expect(assertOfficialCopy(official, "whatsapp")).toBe(official);
  });
});
