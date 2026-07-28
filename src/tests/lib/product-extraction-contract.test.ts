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

  it("rejeita somente um ciclo de redirecionamento real", () => {
    const result = classifyResolution({
      resolvedUrl: "https://meli.la/loop",
      redirectChain: [],
      errorCode: "REDIRECT_LOOP",
    });

    expect(result).toEqual({ status: "rejected", code: "REDIRECT_LOOP" });
  });
});
