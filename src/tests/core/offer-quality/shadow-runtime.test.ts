import { describe, expect, it } from "vitest";
import { evaluateDiscoveryShadow } from "@/core/offer-quality/shadow-runtime";

const product = {
  marketplace: "Shopee",
  sourceItemId: "123",
  sourceUrl: "https://s.shopee.com.br/abc",
  title: "Picador de alimentos",
  imageUrl: "https://cf.shopee.com.br/file/image",
  currentPrice: 79.99,
  originalPrice: 102.99,
  marketplaceMetrics: { itemId: "123", shopId: "456", sales: 12258, rating: 4.8 },
  affiliateLinks: ["telegram", "whatsapp", "facebook", "instagram"].map((channel) => ({
    channel,
    trackedUrl: `https://caca-oferta-oficial.vercel.app/go/${({ telegram: "tg", whatsapp: "wp", facebook: "fb", instagram: "ig" } as Record<string, string>)[channel]}_12345678-1234-4123-8123-123456789012`,
  })),
};

describe("offer quality shadow runtime", () => {
  it("compara V1 e V2 sem qualquer tentativa de persistência", () => {
    const result = evaluateDiscoveryShadow([product], { selected: [product] }, {
      runId: "shadow-test",
      generatedAt: "2026-07-28T12:00:00.000Z",
    });

    expect(result.recordCount).toBe(1);
    expect(result.v1Selected).toBe(1);
    expect(result.v2Winners).toBe(1);
    expect(result.persistAttempts).toBe(0);
  });
});
