import { describe, expect, it } from "vitest";
import { chooseMLExtractionUrl } from "@/lib/publish/ml-extraction-url";

describe("chooseMLExtractionUrl shortlinks do Mercado Livre", () => {
  it("preserva URL técnica original quando ela já contém identidade MLB", () => {
    const inputUrl = "https://www.mercadolivre.com.br/produto/p/MLB70426632?pdp_filters=item_id%3AMLB6861361746";
    expect(
      chooseMLExtractionUrl(
        inputUrl,
        "https://www.mercadolivre.com.br/social/perfil",
        true,
        "MLB6861361746",
      ),
    ).toBe(inputUrl);
  });

  it("constrói URL técnica pelo itemId confirmado quando a entrada é meli.la", () => {
    expect(
      chooseMLExtractionUrl(
        "https://meli.la/1qkZssd",
        "https://www.mercadolivre.com.br/social/doandre20220310102112",
        true,
        "MLB5826790582",
      ),
    ).toBe("https://produto.mercadolivre.com.br/MLB-5826790582");
  });

  it("continua usando resolvedUrl quando a identidade não está confirmada", () => {
    const resolvedUrl = "https://www.mercadolivre.com.br/social/perfil";
    expect(
      chooseMLExtractionUrl("https://meli.la/short", resolvedUrl, false, "MLB5826790582"),
    ).toBe(resolvedUrl);
  });
});
