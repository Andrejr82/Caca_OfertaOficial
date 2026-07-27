import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchShopeeOfficialProduct } from "@/lib/publish/actions";

describe("fetchShopeeOfficialProduct", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("retorna o offerLink afiliado fornecido pela API para link comum da Shopee", async () => {
    vi.stubEnv("SHOPEE_APP_ID", "app-test");
    vi.stubEnv("SHOPEE_APP_SECRET", "secret-test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      json: async () => ({
        data: {
          productOfferV2: {
            nodes: [{
              productName: "Produto Shopee",
              imageUrl: "https://down-br.img.susercontent.com/file/product.jpg",
              priceMin: "59.90",
              offerLink: "https://s.shopee.com.br/affiliate-product",
            }],
          },
        },
      }),
    }));

    const result = await fetchShopeeOfficialProduct("855489892", "23598338864");

    expect(result).toMatchObject({
      title: "Produto Shopee",
      price: 59.9,
      affiliateUrl: "https://s.shopee.com.br/affiliate-product",
    });
  });
});

