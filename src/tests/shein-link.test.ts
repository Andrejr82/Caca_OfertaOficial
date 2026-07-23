import { describe, expect, it } from "vitest";
import { parseSheinOneLinkHtml } from "@/lib/publish/shein-link";

describe("SHEIN OneLink product reference", () => {
  it("extracts the attributed product URL, IDs and a usable title from the hidden url", () => {
    const html = '<input id="url" value="https://br.shein.com/Men-s-Premium-Yacht-Synthetic-Loafer-Sneakers%252C-Comfortable-And-Soft-p-111711285-cat-2090.html?onelink=44/5wio94zbneju&amp;requestId=x" />';
    expect(parseSheinOneLinkHtml(html)).toEqual({
      productUrl: "https://br.shein.com/Men-s-Premium-Yacht-Synthetic-Loafer-Sneakers%252C-Comfortable-And-Soft-p-111711285-cat-2090.html?onelink=44/5wio94zbneju&requestId=x",
      productId: "111711285",
      categoryId: "2090",
      titleFromUrl: "Men s Premium Yacht Synthetic Loafer Sneakers, Comfortable And Soft",
    });
  });

  it("does not treat a campaign page without an attributed product URL as a product", () => {
    expect(parseSheinOneLinkHtml('<html><title>Great offer</title></html>')).toBeNull();
  });
});
