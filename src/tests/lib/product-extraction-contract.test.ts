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

  it("rejeita somente um ciclo de redirecionamento real", () => {
    const result = classifyResolution({
      resolvedUrl: "https://meli.la/loop",
      redirectChain: [],
      errorCode: "REDIRECT_LOOP",
    });

    expect(result).toEqual({ status: "rejected", code: "REDIRECT_LOOP" });
  });
});
