import { describe, expect, it } from "vitest";
import { buildCommercialStoryModel } from "@/app/api/images/instagram-story/route";

describe("Instagram Stories commercial artwork", () => {
  it("uses the real product image and verified price comparison", () => {
    const model = buildCommercialStoryModel({
      product_name: "Mochila jiesipote À Prova D’água Reforçada Expansível Cor Preto",
      platform: "Mercado Livre",
      image_url: "https://images.example.com/mochila.jpg",
      current_price: 79.9,
      old_price: 269,
    });

    expect(model.imageUrl).toBe("https://images.example.com/mochila.jpg");
    expect(model.currentPriceLabel).toContain("79,90");
    expect(model.oldPriceLabel).toContain("269,00");
    expect(model.savingsLabel).toContain("189,10");
    expect(model.discountLabel).toBe("70% OFF");
  });

  it("does not invent discount or savings without a valid previous price", () => {
    const model = buildCommercialStoryModel({
      product_name: "Produto",
      platform: "Shopee",
      image_url: "https://images.example.com/item.jpg",
      current_price: 194.93,
      old_price: null,
    });

    expect(model.currentPriceLabel).toContain("194,93");
    expect(model.oldPriceLabel).toBeNull();
    expect(model.savingsLabel).toBeNull();
    expect(model.discountLabel).toBeNull();
  });

  it("rejects non-HTTPS product images", () => {
    const model = buildCommercialStoryModel({
      product_name: "Produto",
      platform: "Shopee",
      image_url: "http://insecure.example.com/item.jpg",
      current_price: 99.9,
      old_price: 129.9,
    });

    expect(model.imageUrl).toBeNull();
  });
});
