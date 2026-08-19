import { describe, expect, it } from "vitest";
import { classifyResolution } from "@/lib/publish/product-extraction-contract";

describe("classifyResolution", () => {
  it("preserva a identidade do item quando o Mercado Livre entrega uma página antibot", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/gz/account-verification?go=product",
      redirectChain: [
        "https://www.mercadolivre.com.br/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746",
      ],
      marketplace: "Mercado Livre",
      selectedItemId: "MLB6861361746",
      errorCode: "ANTI_BOT_REDIRECT_WITH_ORIGINAL_ID",
    });

    expect(result).toMatchObject({
      status: "confirmed_identity",
      itemId: "MLB6861361746",
      resolvedUrl: "https://www.mercadolivre.com.br/gz/account-verification?go=product",
    });
  });

  it("aceita rota /social quando a própria URL final confirma um produto individual", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil?pdp_filters=item_id%3AMLB6861361746",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      finalItemId: "MLB6861361746",
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({
      status: "confirmed_identity",
      itemId: "MLB6861361746",
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil?pdp_filters=item_id%3AMLB6861361746",
    });
  });

  it("aceita rota /social quando canonical/og:url confirmam um único produto", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      htmlBody: `
        <html>
          <head>
            <link rel="canonical" href="https://www.mercadolivre.com.br/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746&amp;wid=MLB6861361746" />
            <meta property="og:url" content="https://www.mercadolivre.com.br/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746" />
          </head>
        </html>
      `,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({
      status: "confirmed_identity",
      itemId: "MLB6861361746",
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
    });
  });

  it("aceita wrapper /social oficial quando meta refresh navega para um único produto", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/1qkZssd"],
      marketplace: "Mercado Livre",
      htmlBody: `
        <html><head>
          <meta http-equiv="refresh" content="0; url=https://www.mercadolivre.com.br/celular-samsung-galaxy-a17-5g/p/MLB55027309?pdp_filters=item_id%3AMLB5826790582&amp;wid=MLB5826790582" />
        </head></html>
      `,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({
      status: "confirmed_identity",
      itemId: "MLB5826790582",
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
    });
  });

  it("aceita wrapper /social oficial quando JavaScript navega para um único produto", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/1qkZssd"],
      marketplace: "Mercado Livre",
      htmlBody: `<script>window.location.replace("https://www.mercadolivre.com.br/celular-samsung/p/MLB55027309?pdp_filters=item_id%3AMLB5826790582")</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toMatchObject({
      status: "confirmed_identity",
      itemId: "MLB5826790582",
    });
  });

  it("recupera o item do link 1qkZssd pelo card featured do SSR Nordic sem contaminar recomendações", () => {
    const nordic = {
      _n: {
        ctx: {
          r: {
            appProps: {
              pageProps: {
                data: {
                  components: [
                    {
                      recommendation_data: {
                        recommendation_info: {
                          polycards: [
                            {
                              c_id: "/home/card-featured/element",
                              metadata: {
                                id: "MLB5826790582",
                                product_id: "MLB55027309",
                                url: "https://www.mercadolivre.com.br/celular-samsung-galaxy-a17-5g/p/MLB55027309",
                              },
                            },
                          ],
                        },
                      },
                    },
                    {
                      tabs: [
                        {
                          polycards: [
                            {
                              c_id: "/home/card-recommendation/element",
                              metadata: {
                                id: "MLB1111111111",
                                url: "https://produto.mercadolivre.com.br/MLB-1111111111-recomendado-_JM",
                              },
                            },
                            {
                              c_id: "/home/card-recommendation/element",
                              metadata: {
                                id: "MLB2222222222",
                                url: "https://produto.mercadolivre.com.br/MLB-2222222222-recomendado-_JM",
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
      redirectChain: ["https://meli.la/1qkZssd"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__" type="application/json">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({
      status: "confirmed_identity",
      itemId: "MLB5826790582",
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
    });
  });

  it("recupera o item direto do link 2AfuzK7 pelo card featured do SSR Nordic", () => {
    const nordic = {
      _n: {
        ctx: {
          r: {
            appProps: {
              pageProps: {
                data: {
                  components: [
                    {
                      recommendation_data: {
                        recommendation_info: {
                          polycards: [
                            {
                              c_id: "/home/card-featured/element",
                              metadata: {
                                id: "MLB4592320910",
                                url: "https://produto.mercadolivre.com.br/MLB-4592320910-kit-4-camiseta-dry-fit-_JM",
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre20220310102112",
      redirectChain: ["https://meli.la/2AfuzK7"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toMatchObject({
      status: "confirmed_identity",
      itemId: "MLB4592320910",
    });
  });

  it("mantém fail-closed quando o SSR Nordic contém mais de um card featured", () => {
    const nordic = {
      polycards: [
        {
          c_id: "/home/card-featured/element",
          metadata: {
            id: "MLB1111111111",
            url: "https://produto.mercadolivre.com.br/MLB-1111111111-a-_JM",
          },
        },
        {
          c_id: "/home/card-featured/element",
          metadata: {
            id: "MLB2222222222",
            url: "https://produto.mercadolivre.com.br/MLB-2222222222-b-_JM",
          },
        },
      ],
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/lista"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("mantém fail-closed quando item e URL do card featured divergem", () => {
    const nordic = {
      polycards: [
        {
          c_id: "/home/card-featured/element",
          metadata: {
            id: "MLB1111111111",
            url: "https://produto.mercadolivre.com.br/MLB-2222222222-produto-_JM",
          },
        },
      ],
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("mantém fail-closed quando catálogo do card featured diverge da URL /p/", () => {
    const nordic = {
      polycards: [
        {
          c_id: "/home/card-featured/element",
          metadata: {
            id: "MLB5826790582",
            product_id: "MLB9999999999",
            url: "https://www.mercadolivre.com.br/produto/p/MLB55027309",
          },
        },
      ],
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("mantém fail-closed quando o featured aponta para domínio externo", () => {
    const nordic = {
      polycards: [
        {
          c_id: "/home/card-featured/element",
          metadata: {
            id: "MLB5826790582",
            url: "https://evil.example/MLB5826790582",
          },
        },
      ],
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("ignora navegação para domínio externo mesmo que a URL contenha um MLB", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      htmlBody: '<meta http-equiv="refresh" content="0; url=https://evil.example/MLB5826790582" />',
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("mantém vitrine/lista real bloqueada quando não existe identidade individual", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/lista"],
      marketplace: "Mercado Livre",
      htmlBody: '<meta property="og:url" content="https://www.mercadolivre.com.br/social/perfil" />',
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("mantém fail-closed quando evidências confiáveis apontam para produtos diferentes", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil?pdp_filters=item_id%3AMLB1111111111",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      finalItemId: "MLB1111111111",
      htmlBody: '<link rel="canonical" href="https://produto.mercadolivre.com.br/MLB-2222222222-produto-_JM" />',
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("mantém fail-closed quando duas navegações confiáveis apontam para produtos diferentes", () => {
    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/short"],
      marketplace: "Mercado Livre",
      htmlBody: `
        <meta http-equiv="refresh" content="0; url=https://produto.mercadolivre.com.br/MLB-1111111111-produto-_JM" />
        <script>location.href="https://produto.mercadolivre.com.br/MLB-2222222222-produto-_JM"</script>
      `,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("não relaxa mismatch comprovado de produto", () => {
    const result = classifyResolution({
      resolvedUrl: "https://produto.mercadolivre.com.br/MLB-2222222222-produto-_JM",
      redirectChain: [],
      marketplace: "Mercado Livre",
      originalItemId: "MLB1111111111",
      finalItemId: "MLB2222222222",
      identitySource: "MISMATCH",
      errorCode: "PRODUCT_ID_MISMATCH",
    });

    expect(result).toEqual({ status: "rejected", code: "PRODUCT_ID_MISMATCH" });
  });

  it("recupera o item do link 18dxNo8 com catálogo de usuário (/up/MLBU...) pelo card featured do SSR Nordic", () => {
    const nordic = {
      _n: {
        ctx: {
          r: {
            appProps: {
              pageProps: {
                data: {
                  components: [
                    { type: "header" },
                    {
                      type: "recommendations",
                      recommendation_data: {
                        recommendation_info: {
                          polycards: [
                            {
                              metadata: {
                                id: "MLB6037755720",
                                user_product_id: "MLBU1993483730",
                                url: "www.mercadolivre.com.br/kit-4-short-praia/up/MLBU1993483730",
                                url_fragments: "#polycard_client=recommendations_home_affiliate-profile&c_id=/home/card-featured/element",
                              },
                              components: [
                                {
                                  type: "title",
                                  title: { text: "Kit 4 Short Praia Masculino" },
                                },
                                {
                                  type: "price",
                                  price: { current_price: { value: 72.65 } },
                                },
                              ],
                              pictures: [{ url: "https://http2.mlstatic.com/short.webp" }],
                            },
                          ],
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/doandre",
      redirectChain: ["https://meli.la/18dxNo8"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">_n.ctx.r = ${JSON.stringify(nordic._n.ctx.r)};</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toMatchObject({
      status: "confirmed_identity",
      itemId: "MLB6037755720",
      fallbackDetails: {
        title: "Kit 4 Short Praia Masculino",
        price: 72.65,
        imageUrl: "https://http2.mlstatic.com/short.webp",
      },
    });
  });

  it("rejeita card featured de catálogo de usuário quando o user_product_id diverge da URL", () => {
    const nordic = {
      appProps: {
        pageProps: {
          data: {
            components: [
              {
                polycards: [
                  {
                    metadata: {
                      id: "MLB6037755720",
                      user_product_id: "MLBU1111111111",
                      url: "www.mercadolivre.com.br/kit-4-short-praia/up/MLBU2222222222",
                      c_id: "/home/card-featured/element",
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    };

    const result = classifyResolution({
      resolvedUrl: "https://www.mercadolivre.com.br/social/perfil",
      redirectChain: ["https://meli.la/18dxNo8"],
      marketplace: "Mercado Livre",
      htmlBody: `<script id="__NORDIC_RENDERING_CTX__">${JSON.stringify(nordic)}</script>`,
      errorCode: "AFFILIATE_SHOWCASE_NOT_PRODUCT",
    });

    expect(result).toEqual({ status: "rejected", code: "AFFILIATE_SHOWCASE_NOT_PRODUCT" });
  });

  it("rejeita somente um ciclo de redirecionamento real", () => {
    const result = classifyResolution({
      resolvedUrl: "https://meli.la/loop",
      redirectChain: [],
      errorCode: "REDIRECT_LOOP",
    });

    expect(result).toEqual({ status: "rejected", code: "REDIRECT_LOOP" });
  });
});
