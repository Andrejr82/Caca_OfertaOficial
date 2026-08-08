import { describe, expect, it } from "vitest";
import { validateExpressProduct } from "@/lib/publish/express-product-validator";

const confirmedShein = {
  title: "Tênis Masculino Wave 12s Linha Premium",
  marketplace: "Shein",
  imageUrl: "https://img.ltwebstatic.com/images3_ps1/2024/09/05/1a/17255207321b314100eb24f789bb19ac1da3624dfe.png",
  price: 146.25,
  resolvedUrl: "https://onelink.shein.com/46/5yac8yoeq9ek?shc=2_RSsqGOruYeo",
};

describe("Shein assisted confirmation validation", () => {
  it("keeps automatic OneLink without identity fail-closed", () => {
    const result = validateExpressProduct(confirmedShein);
    expect(result.approved).toBe(false);
    expect(result.errorCode).toBe("PRODUCT_PAGE_NOT_CONFIRMED");
  });

  it("accepts only explicit manual confirmation without identity", () => {
    const result = validateExpressProduct({ ...confirmedShein, manualConfirmation: true });
    expect(result).toMatchObject({
      approved: true,
      identityConfirmed: true,
      nameConfirmed: true,
      priceConfirmed: true,
      imageConfirmed: true,
    });
  });
});
