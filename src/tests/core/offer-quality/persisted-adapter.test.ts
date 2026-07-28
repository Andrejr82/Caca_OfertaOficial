import { describe, expect, it } from "vitest";
import { toOfferQualityCandidateInput } from "@/core/offer-quality/persisted-adapter";

const links = ["telegram", "whatsapp", "facebook", "instagram"].map((channel) => ({
  channel,
  tracked_url: `https://caca-oferta-oficial.vercel.app/go/${channel}_12345678-1234-4123-8123-123456789012`,
}));

describe("persisted offer adapter", () => {
  it("uses explainability marketplace metrics when the top-level column is empty", () => {
    const candidate = toOfferQualityCandidateInput({
      platform: "Shopee",
      product_name: "Picador de alimentos",
      original_url: "https://s.shopee.com.br/abc",
      image_url: "https://cf.shopee.com.br/file/image",
      current_price: "79.99",
      old_price: "102.99",
      shopee_item_id: "58253145740",
      marketplace_metrics: {},
      explainability: {
        marketplace_metrics: { itemId: "58253145740", shopId: "1362240140", sales: 12258, rating: 4.8 },
        discount_reason: "VALID",
      },
      affiliate_links: links,
    });

    expect(candidate?.nativeIdentity).toBe("58253145740");
    expect(candidate?.marketplaceMetrics).toMatchObject({ sales: 12258, rating: 4.8 });
    expect(candidate?.discountEvidence).toBeNull();
    expect(candidate?.affiliateLinks).toHaveLength(4);
  });

  it("does not invent an identity when persisted native fields are absent", () => {
    const candidate = toOfferQualityCandidateInput({
      platform: "Amazon",
      product_name: "Produto manual",
      original_url: "https://www.amazon.com.br/dp/B0ABC12345",
      image_url: "https://m.media-amazon.com/images/I/test.jpg",
      current_price: 10,
      affiliate_links: [],
    });

    expect(candidate?.nativeIdentity).toBeNull();
    expect(candidate?.sourceItemId).toBeNull();
  });

  it("accepts explicit price-history evidence only", () => {
    const candidate = toOfferQualityCandidateInput({
      platform: "Mercado Livre",
      product_name: "Produto com histórico",
      original_url: "https://www.mercadolivre.com.br/item/MLB123",
      image_url: "https://http2.mlstatic.com/image.jpg",
      current_price: 50,
      old_price: 100,
      item_id: "MLB123",
      explainability: { marketplace_metrics: { priceHistoryVerified: true } },
    });

    expect(candidate?.discountEvidence).toEqual({ source: "price_history_verified" });
  });
});
