import { describe, expect, it } from "vitest";
import { classifyResolution } from "@/lib/publish/product-extraction-contract";

function buildRealNordicHtml(card: Record<string, unknown>): string {
  const renderingContext = {
    appProps: {
      pageProps: {
        data: {
          components: [
            { type: "header" },
            {
              recommendation_data: {
                recommendation_info: {
                  polycards: [card],
                },
              },
            },
          ],
        },
      },
    },
  };

  return `<script id="__NORDIC_RENDERING_CTX__">
    _n.ctx.r = ${JSON.stringify(renderingContext)};
    _n.ctx.r.assets.mainAssetsNames = { scripts: new Set(["main"]) };
  </script>`;
}

describe("Mercado Livre Nordic url_fragments", () => {
  it("reconhece featured pelo c_id presente em metadata.url_fragments", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
      redirectChain: ["https://meli.la/1qkZssd"],
      marketplace: "Mercado Livre",
      htmlBody: buildRealNordicHtml({
        metadata: {
          id: "MLB5826790582",
          product_id: "MLB55027309",
          url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-a17-5g/p/MLB55027309",
          url_fragments: "client=recommendations_home_affiliate-profile&c_id=%2Fhome%2Fcard-featured%2Felement&position=1",
        },
      }),
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({
      status: "confirmed_identity",
      itemId: "MLB5826790582",
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
    });
  });

  it("não promove recomendação secundária apenas por conter url_fragments", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/lista"],
      marketplace: "Mercado Livre",
      htmlBody: buildRealNordicHtml({
        metadata: {
          id: "MLB1111111111",
          url: "https://produto.mercadolivre.com.br/MLB-1111111111-recomendado-_JM",
          url_fragments: "client=recommendations_home_affiliate-profile&c_id=%2Fhome%2Fcard-recommendation%2Felement",
        },
      }),
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });
});
