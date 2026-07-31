import { describe, expect, it } from "vitest";
import { buildImportedDrafts } from "@/lib/videos/import/drafts";

const offer = {
  id: "offer-1",
  product_name: "Cafeteira Compacta",
  platform: "shopee",
  image_url: "https://cdn.example.com/product.jpg",
  current_price: 99.9,
  old_price: 129.9,
  coupon: null,
  shipping_free: true,
  seller_name: "Loja Exemplo",
  category: "Casa",
  explainability: { affiliate_url: "https://s.shopee.com.br/affiliate-offer-1" },
  affiliate_links: [
    { channel: "instagram", tracked_url: "https://caca-oferta.test/go/ig_offer-1" },
    { channel: "facebook", tracked_url: "https://caca-oferta.test/go/fb_offer-1" }
  ]
};

describe("imported video drafts", () => {
  it("creates only Instagram and Facebook drafts from offer data", () => {
    const drafts = buildImportedDrafts(offer, ["instagram", "facebook"]);
    expect(drafts.map((draft) => draft.channel)).toEqual(["instagram", "facebook"]);
    expect(drafts[0].trackedUrl).toBe("https://caca-oferta.test/go/ig_offer-1");
    expect(drafts[1].trackedUrl).toBe("https://caca-oferta.test/go/fb_offer-1");
    expect(drafts.every((draft) => !draft.content.includes("br.shp.ee"))).toBe(true);
  });

  it("rejects a channel without a monetized link", () => {
    expect(() => buildImportedDrafts({ ...offer, affiliate_links: [{ channel: "instagram", tracked_url: "" }] }, ["instagram"]))
      .toThrow("NO_MONETIZED_LINK");
  });
});
