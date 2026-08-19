import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchMLProductDetailsResult } from "@/lib/platforms/mercadolivre";
import { fetchMLFeaturedSnapshotFallback, ML_EXPRESS_SOURCE_PARAM } from "@/lib/platforms/mercadolivre-featured-fallback";
import { chooseMLExtractionUrl } from "@/lib/publish/ml-extraction-url";

function buildRealLikeNordicHtml(params: {
  itemId: string;
  productId?: string;
  productUrl: string;
  title: string;
  price: number;
  imageUrl: string;
}) {
  const featured = {
    title: params.title,
    metadata: {
      id: params.itemId,
      product_id: params.productId ?? null,
      url: params.productUrl,
      url_fragments: "polycard_client=recommendations_home_affiliate-profile&reco_item_pos=0&c_id=%2Fhome%2Fcard-featured%2Felement",
    },
    price: { current_price: params.price, original_price: params.price + 100 },
    picture: { image_url: params.imageUrl },
  };
  const secondary = {
    title: "Produto secundário que não pode contaminar a identidade",
    metadata: {
      id: "MLB9999999999",
      url: "https://produto.mercadolivre.com.br/MLB-9999999999-secundario-_JM",
      url_fragments: "polycard_client=recommendations_home_affiliate-profile&reco_item_pos=1",
    },
    price: { current_price: 1.99 },
    picture: { image_url: "https://http2.mlstatic.com/D_NQ_NP_secondary-O.webp" },
  };
  const context = {
    appProps: {
      pageProps: {
        data: {
          components: [
            { recommendation_data: { recommendation_info: { polycards: [featured, secondary] } } },
          ],
        },
      },
    },
  };
  return `<html><body><script id="__NORDIC_RENDERING_CTX__">_n.ctx.r = ${JSON.stringify(context)}; _n.ctx.r.assets = { mainAssetsNames: { scripts: new Set(["main"]) } };</script></body></html>`;
}

describe("fallback SSR real do Mercado Livre para shortlink afiliado", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MERCADO_LIVRE_ACCESS_TOKEN;
  });

  it("mantém o meli.la como origem técnica somente quando a identidade já foi confirmada", () => {
    const extraction = chooseMLExtractionUrl(
      "https://meli.la/2AfuzK7",
      "https://www.mercadolivre.com.br/social/perfil",
      true,
      "MLB4592320910",
    );
    const parsed = new URL(extraction);
    expect(parsed.pathname).toContain("MLB-4592320910");
    expect(parsed.searchParams.get(ML_EXPRESS_SOURCE_PARAM)).toBe("https://meli.la/2AfuzK7");

    expect(chooseMLExtractionUrl(
      "https://meli.la/2AfuzK7",
      "https://www.mercadolivre.com.br/social/perfil",
      false,
      "MLB4592320910",
    )).toBe("https://www.mercadolivre.com.br/social/perfil");
  });

  it("extrai apenas o featured real do Nordic com JavaScript posterior ao JSON", async () => {
    const socialUrl = "https://www.mercadolivre.com.br/social/doandre20220310102112";
    const html = buildRealLikeNordicHtml({
      itemId: "MLB5826790582",
      productId: "MLB55027309",
      productUrl: "https://www.mercadolivre.com.br/celular-samsung/p/MLB55027309",
      title: "Celular Samsung Galaxy A17 5g Com Ia 128gb",
      price: 930.05,
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_755351-MLA99597188918_122025-O.webp",
    });

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://meli.la/1qkZssd") {
        return new Response(null, { status: 302, headers: { location: socialUrl } });
      }
      if (url === socialUrl) return new Response(html, { status: 200 });
      throw new Error(`URL inesperada: ${url}`);
    });

    const extractionUrl = `https://produto.mercadolivre.com.br/MLB-5826790582?${ML_EXPRESS_SOURCE_PARAM}=${encodeURIComponent("https://meli.la/1qkZssd")}`;
    await expect(fetchMLFeaturedSnapshotFallback(extractionUrl, "MLB5826790582")).resolves.toMatchObject({
      title: "Celular Samsung Galaxy A17 5g Com Ia 128gb",
      price: 930.05,
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_755351-MLA99597188918_122025-O.webp",
      finalUrl: "https://www.mercadolivre.com.br/celular-samsung/p/MLB55027309",
      confidenceScore: 100,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("bloqueia redirect para domínio não Mercado Livre antes de buscar o destino", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }),
    );
    const extractionUrl = `https://produto.mercadolivre.com.br/MLB-4592320910?${ML_EXPRESS_SOURCE_PARAM}=${encodeURIComponent("https://meli.la/2AfuzK7")}`;
    await expect(fetchMLFeaturedSnapshotFallback(extractionUrl, "MLB4592320910")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("usa o featured SSR quando o multiget retorna HTTP 200 com code 403 interno", async () => {
    process.env.MERCADO_LIVRE_ACCESS_TOKEN = "test-token";
    const socialUrl = "https://www.mercadolivre.com.br/social/doandre20220310102112";
    const html = buildRealLikeNordicHtml({
      itemId: "MLB4592320910",
      productUrl: "https://produto.mercadolivre.com.br/MLB-4592320910-kit-4-camiseta-dry-fit-_JM",
      title: "Kit 4 Camiseta Dry-fit Sandrini Masculina Academia Caminhada",
      price: 69.9,
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_626928-MLB82004918446_022025-O.webp",
    });

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.mercadolibre.com/items?ids=MLB4592320910")) {
        return new Response(JSON.stringify([{ code: 403, body: { message: "forbidden" } }]), { status: 200 });
      }
      if (url === "https://meli.la/2AfuzK7") {
        return new Response(null, { status: 302, headers: { location: socialUrl } });
      }
      if (url === socialUrl) return new Response(html, { status: 200 });
      throw new Error(`URL inesperada: ${url}`);
    });

    const extractionUrl = chooseMLExtractionUrl(
      "https://meli.la/2AfuzK7",
      socialUrl,
      true,
      "MLB4592320910",
    );

    await expect(fetchMLProductDetailsResult(extractionUrl)).resolves.toMatchObject({
      ok: true,
      data: {
        title: "Kit 4 Camiseta Dry-fit Sandrini Masculina Academia Caminhada",
        price: 69.9,
        imageUrl: "https://http2.mlstatic.com/D_NQ_NP_626928-MLB82004918446_022025-O.webp",
        finalUrl: "https://produto.mercadolivre.com.br/MLB-4592320910-kit-4-camiseta-dry-fit-_JM",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("falha fechado se o featured não corresponder ao item confirmado", async () => {
    const socialUrl = "https://www.mercadolivre.com.br/social/doandre20220310102112";
    const html = buildRealLikeNordicHtml({
      itemId: "MLB1111111111",
      productUrl: "https://produto.mercadolivre.com.br/MLB-1111111111-outro-_JM",
      title: "Produto divergente",
      price: 50,
      imageUrl: "https://http2.mlstatic.com/D_NQ_NP_outro-O.webp",
    });
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: socialUrl } }))
      .mockResolvedValueOnce(new Response(html, { status: 200 }));

    const extractionUrl = `https://produto.mercadolivre.com.br/MLB-4592320910?${ML_EXPRESS_SOURCE_PARAM}=${encodeURIComponent("https://meli.la/2AfuzK7")}`;
    await expect(fetchMLFeaturedSnapshotFallback(extractionUrl, "MLB4592320910")).resolves.toBeNull();
  });
});
