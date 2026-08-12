import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchShopeeOfficialProduct, readAmazonMetadata } from "@/lib/publish/actions";
import { chooseMLExtractionUrl } from "@/lib/publish/ml-extraction-url";
import { classifyMLApiFailure, fetchMLProductDetailsResult } from "@/lib/platforms/mercadolivre";

describe("extração nativa da Publicação Expressa", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.SHOPEE_APP_ID;
    delete process.env.SHOPEE_APP_SECRET;
    delete process.env.ORACLE_API_KEY;
    delete process.env.ORACLE_REMOTE_URL;
    delete process.env.MERCADO_LIVRE_ACCESS_TOKEN;
  });

  it("normaliza preço brasileiro e imagem sem protocolo da Shopee Open API", async () => {
    process.env.SHOPEE_APP_ID = "app";
    process.env.SHOPEE_APP_SECRET = "secret";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: { productOfferV2: { nodes: [{ itemId: "2", productName: "Produto Shopee Nativo", imageUrl: "//cf.shopee.com.br/item.jpg", priceMin: "R$ 129,90", offerLink: "https://s.shopee.com.br/abc" }] } } }),
    } as Response);

    await expect(fetchShopeeOfficialProduct("1", "2")).resolves.toMatchObject({
      title: "Produto Shopee Nativo",
      imageUrl: "https://cf.shopee.com.br/item.jpg",
      price: 129.9,
    });
  });

  it("usa a Open API oficial quando o lookup Oracle não confirma o SKU", async () => {
    process.env.ORACLE_API_KEY = "oracle-key";
    process.env.ORACLE_REMOTE_URL = "https://oracle.example";
    process.env.SHOPEE_APP_ID = "app";
    process.env.SHOPEE_APP_SECRET = "secret";
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, code: "SHOPEE_PRODUCT_NOT_FOUND" }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          productOfferV2: {
            nodes: [{
              itemId: "23692960598",
              productName: "Kit Facas de Cozinha",
              imageUrl: "//cf.shopee.com.br/facas.jpg",
              priceMin: "39,90",
              offerLink: "https://s.shopee.com.br/afiliado",
            }],
          },
        },
      }), { status: 200 }));

    const { fetchShopeeMetadataViaOracle } = await import("@/lib/publish/actions");
    await expect(fetchShopeeMetadataViaOracle("390307022", "23692960598", "kit facas"))
      .resolves.toMatchObject({ title: "Kit Facas de Cozinha", price: 39.9 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("continua a busca oficial pela palavra-chave extraída da URL", async () => {
    process.env.SHOPEE_APP_ID = "app";
    process.env.SHOPEE_APP_SECRET = "secret";
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { productOfferV2: { nodes: [] } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        data: {
          productOfferV2: {
            nodes: [{
              itemId: "21163105419",
              productName: "Balança Digital Medidora Corporal",
              imageUrl: "//cf.shopee.com.br/balanca.jpg",
              priceMin: "89,90",
              offerLink: "https://s.shopee.com.br/balanca",
            }],
          },
        },
      }), { status: 200 }));

    await expect(fetchShopeeOfficialProduct("375201738", "21163105419", "Balança Digital Medidora Corporal"))
      .resolves.toMatchObject({ title: "Balança Digital Medidora Corporal", price: 89.9 });
    const shopeeRequest = fetchMock.mock.calls
      .map(([, init]) => {
        try { return JSON.parse(String(init?.body)); } catch { return null; }
      })
      .find((body) => body?.variables?.keyword === "Balança Digital Medidora Corporal");
    expect(shopeeRequest?.variables.keyword).toBe("Balança Digital Medidora Corporal");
  });

  it("extrai título, preço e imagem da página Amazon sem provedor externo", async () => {
    const html = `<title>Tênis Pounce Lite Running Adulto | Amazon.com.br</title><meta property="og:image" content="https://m.media-amazon.com/images/I/tenis.jpg"><span data-x="1" class="foo a-offscreen">R$ 249,90</span>`;
    await expect(readAmazonMetadata("https://www.amazon.com.br/dp/B0D1YHS4TT", html)).resolves.toEqual({
      title: "Tênis Pounce Lite Running Adulto",
      imageUrl: "https://m.media-amazon.com/images/I/tenis.jpg",
      price: 249.9,
    });
  });
});

describe("falhas da API do Mercado Livre", () => {
  it("preserva o link de catálogo quando a identidade veio do fallback anti-bot", () => {
    const catalogUrl = "https://www.mercadolivre.com.br/produto/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746";
    expect(chooseMLExtractionUrl(catalogUrl, "https://produto.mercadolivre.com.br/MLB-6861361746", true, "MLB6861361746")).toBe(catalogUrl);
    expect(chooseMLExtractionUrl(catalogUrl, "https://produto.mercadolivre.com.br/MLB-6861361746", false, "MLB6861361746")).toContain("produto.mercadolivre.com.br");
  });

  it("classifica 403 como credencial ou permissão, não como produto ausente", () => {
    expect(classifyMLApiFailure(403)).toBe("MARKETPLACE_PERMISSION_DENIED");
  });

  it("classifica indisponibilidade não autorizada como fonte temporariamente indisponível", () => {
    expect(classifyMLApiFailure(429)).toBe("MARKETPLACE_SOURCE_UNAVAILABLE");
  });

  it("propaga 403 da fonte oficial como falha de permissão tipada", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    } as Response);

    await expect(
      fetchMLProductDetailsResult("https://produto.mercadolivre.com.br/MLB-6861361746-produto-_JM"),
    ).resolves.toEqual({ ok: false, code: "MARKETPLACE_PERMISSION_DENIED" });
  });

  it("usa o catálogo quando a consulta do item retorna 403", async () => {
    process.env.MERCADO_LIVRE_ACCESS_TOKEN = "test-token";
    const fetchMock = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [{ item_id: "MLB6861361746", price: 79.9, thumbnail: "https://img.example/item.jpg" }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ name: "Massageador Facial", pictures: [{ secure_url: "https://img.example/catalog.jpg" }], permalink: "https://www.mercadolivre.com.br/p/MLB70426632", buy_box_winner: { price: 79.9 } }),
      } as Response);

    await expect(
      fetchMLProductDetailsResult("https://www.mercadolivre.com.br/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746"),
    ).resolves.toMatchObject({
      ok: true,
      data: { title: "Massageador Facial", price: 79.9, imageUrl: "https://img.example/item.jpg" },
    });
    const requests = fetchMock.mock.calls.map(([request]) => String(request));
    expect(requests).toContain("https://api.mercadolibre.com/products/MLB70426632/items?limit=20");
    expect(requests).toContain("https://api.mercadolibre.com/products/MLB70426632");
  });

  it("usa a primeira oferta do catálogo quando a URL não traz pdp_filters", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const request = String(input);
      if (request.endsWith("/products/MLB57427066/items?limit=20")) {
        return {
          ok: true,
          json: async () => ({ results: [{ item_id: "MLB4447861777", price: 26.41, thumbnail: "https://img.example/item.jpg", permalink: "https://produto.mercadolivre.com.br/MLB-4447861777" }] }),
        } as Response;
      }
      if (request.endsWith("/products/MLB57427066")) {
        return {
          ok: true,
          json: async () => ({ name: "Massageador Facial", pictures: [{ secure_url: "https://img.example/catalog.jpg" }], permalink: "https://www.mercadolivre.com.br/p/MLB57427066" }),
        } as Response;
      }
      return { ok: true, text: async () => "" } as Response;
    });

    await expect(
      fetchMLProductDetailsResult("https://www.mercadolivre.com.br/massageador/p/MLB57427066"),
    ).resolves.toMatchObject({
      ok: true,
      data: { title: "Massageador Facial", price: 26.41, imageUrl: "https://img.example/item.jpg" },
    });
  });
});
