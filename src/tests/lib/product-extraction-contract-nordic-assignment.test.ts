import { describe, expect, it } from "vitest";
import { classifyResolution } from "@/lib/publish/product-extraction-contract";

function buildNordicHtml(card: Record<string, unknown>): string {
  const renderingContext = {
    appProps: {
      pageProps: {
        data: {
          components: [
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
    parser_guard: "texto com { chaves } e \\\"aspas escapadas\\\"",
  };

  return `<script id="__NORDIC_RENDERING_CTX__">
    _n.ctx.r = ${JSON.stringify(renderingContext)};
    _n.ctx.r.assets = { mainAssetsNames: { scripts: new Set(["main", "vendor"]) } };
    window.__afterNordic = true;
  </script>`;
}

describe("Mercado Livre Nordic real assignment", () => {
  it("recupera item de catálogo quando o script real continua após _n.ctx.r", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
      redirectChain: ["https://meli.la/1qkZssd"],
      marketplace: "Mercado Livre",
      htmlBody: buildNordicHtml({
        c_id: "/home/card-featured/element",
        metadata: {
          id: "MLB5826790582",
          product_id: "MLB55027309",
          url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-a17-5g/p/MLB55027309",
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

  it("recupera item direto quando o script real continua após _n.ctx.r", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
      redirectChain: ["https://meli.la/2AfuzK7"],
      marketplace: "Mercado Livre",
      htmlBody: buildNordicHtml({
        c_id: "/home/card-featured/element",
        metadata: {
          id: "MLB4592320910",
          url: "https://produto.mercadolivre.com.br/MLB-4592320910-kit-4-camiseta-dry-fit-_JM",
        },
      }),
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toMatchObject({
      status: "confirmed_identity",
      itemId: "MLB4592320910",
    });
  });
});
