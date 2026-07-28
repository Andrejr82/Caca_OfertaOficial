import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchShopeeMetadataViaOracle, fetchShopeeOfficialProduct, readShopeeMetadata } from "@/lib/publish/actions";

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

  it("envia o mesmo contrato GraphQL da descoberta nativa da Oracle", async () => {
    vi.stubEnv("SHOPEE_APP_ID", "app-test");
    vi.stubEnv("SHOPEE_APP_SECRET", "secret-test");
    const fetchMock = vi.fn().mockImplementation(() => new Response(JSON.stringify({
      data: { productOfferV2: { nodes: [] } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchShopeeOfficialProduct("408715442", "22499247158");

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload).toMatchObject({
      operationName: "ShopeePromotionOffers",
      variables: {
        keyword: "https://shopee.com.br/product/408715442/22499247158",
        productCatId: null,
        page: 1,
        limit: 20,
        sortType: 2,
        isAMSOffer: true,
      },
    });
    expect(payload.query).toContain("shopId");
    expect(payload.query).toContain("productLink");
  });

  it("usa a leitura técnica da Oracle quando a Shopee não indexa o SKU na API afiliada", async () => {
    vi.stubEnv("SHOPEE_APP_ID", "app-test");
    vi.stubEnv("SHOPEE_APP_SECRET", "secret-test");
    vi.stubEnv("ORACLE_REMOTE_URL", "https://oracle.example.com");
    vi.stubEnv("ORACLE_API_KEY", "oracle-test-key");
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Response(JSON.stringify({
        success: true,
        data: { extract: { title: "Produto confirmado pela Oracle", price: "R$ 79,90", image: "https://img.example.com/product.jpg" } },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchShopeeMetadataViaOracle("https://shopee.com.br/product/408715442/22499247158");
    expect(result).toEqual({
      title: "Produto confirmado pela Oracle",
      price: 79.9,
      imageUrl: "https://img.example.com/product.jpg",
    });
    const oracleCall = fetchMock.mock.calls[0];
    expect(oracleCall[0]).toBe("https://oracle.example.com/api/scrape");
    expect(oracleCall[1].body).toContain("oracle-test-key");
  });

  it("usa o endpoint padrão da Oracle quando a URL remota não foi definida", async () => {
    vi.stubEnv("ORACLE_API_KEY", "oracle-test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { extract: { title: "Produto Oracle", price: 10, image: "https://img.example.com/p.jpg" } },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await fetchShopeeMetadataViaOracle("https://shopee.com.br/product/1/2");

    expect(fetchMock.mock.calls[0][0]).toBe("http://193.122.242.178:3002/api/scrape");
  });

  it("extrai o nome do produto do slug da URL quando a página não expõe og:title", async () => {
    const html = '<meta property="og:image" content="https://img.shopee.test/item.jpg">';
    const result = await readShopeeMetadata(
      "https://shopee.com.br/Aspirador-Vertical-Electrolux-Com-Fio-Stk15-127V-Urban-Grey-i.1509845472.22494398493",
      html,
    );

    expect(result.title).toBe("Aspirador Vertical Electrolux Com Fio Stk15 127V Urban Grey");
  });

  it("usa a página canônica do produto quando opaanlp não fornece título", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ text: async () => "" })
      .mockResolvedValueOnce({
        text: async () => '<meta property="og:title" content="Aspirador Vertical Electrolux STK15">',
      }));

    const result = await readShopeeMetadata(
      "https://shopee.com.br/opaanlp/1509845472/22494398493",
    );

    expect(result.title).toContain("Aspirador Vertical Electrolux");
    expect(fetch).toHaveBeenCalledWith(
      "https://shopee.com.br/product/1509845472/22494398493",
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });
});
