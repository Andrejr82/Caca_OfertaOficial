import { describe, expect, it } from "vitest";
import { deriveShopeeKeyword, selectShopeeIdentity } from "@/lib/publish/shopee-identity";

describe("selectShopeeIdentity", () => {
  it("separa o itemId do identificador combinado devolvido pelo resolvedor", () => {
    expect(selectShopeeIdentity({
      selectedItemId: "1461473610.23698526415",
      resolvedUrl: "https://shopee.com.br/opaanlp/1461473610/23698526415",
    })).toEqual({ shopId: "1461473610", itemId: "23698526415" });
  });
});

describe("deriveShopeeKeyword", () => {
  it("extrai o slug do produto normal para repetir a busca oficial por keyword", () => {
    expect(deriveShopeeKeyword(
      "https://shopee.com.br/carregador-portatil-mini-power-bank-10000mah-i.408715442.22499247158",
    )).toBe("carregador portatil mini power bank 10000mah");
  });
});
