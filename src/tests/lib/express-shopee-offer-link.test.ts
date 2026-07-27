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

  it("tenta o item_id quando a busca pelo URL não encontra o produto", async () => {
    vi.stubEnv("SHOPEE_APP_ID", "app-test");
    vi.stubEnv("SHOPEE_APP_SECRET", "secret-test");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          productOfferV2: {
            nodes: [{
              itemId: "22494398493",
              productName: "Aspirador Shopee",
              imageUrl: "https://down-br.img.susercontent.com/file/aspirador.jpg",
              priceMin: "399.90",
              offerLink: "https://s.shopee.com.br/affiliate-aspirador",
            }],
          },
        },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchShopeeOfficialProduct("1509845472", "22494398493");

    expect(result).toMatchObject({
      title: "Aspirador Shopee",
      price: 399.9,
      affiliateUrl: "https://s.shopee.com.br/affiliate-aspirador",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).variables.keyword).toBe("22494398493");
  });
});
