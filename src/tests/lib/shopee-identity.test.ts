import { describe, expect, it } from "vitest";
import { selectShopeeIdentity } from "@/lib/publish/shopee-identity";

describe("selectShopeeIdentity", () => {
  it("separa o itemId do identificador combinado devolvido pelo resolvedor", () => {
    expect(selectShopeeIdentity({
      selectedItemId: "1461473610.23698526415",
      resolvedUrl: "https://shopee.com.br/opaanlp/1461473610/23698526415",
    })).toEqual({ shopId: "1461473610", itemId: "23698526415" });
  });
});
