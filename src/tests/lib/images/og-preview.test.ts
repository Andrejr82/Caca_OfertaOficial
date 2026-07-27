import { describe, expect, it } from "vitest";
import { normalizeSourceImageUrl } from "@/lib/images/og-preview";

describe("normalizeSourceImageUrl", () => {
  it("removes Amazon resize suffixes so the source can be fetched at full resolution", () => {
    expect(normalizeSourceImageUrl("https://m.media-amazon.com/images/I/61Kvr5FA5mL._AC_UL320_.jpg"))
      .toBe("https://m.media-amazon.com/images/I/61Kvr5FA5mL.jpg");
  });

  it("does not rewrite non-Amazon URLs", () => {
    const url = "https://http2.mlstatic.com/D_NQ_NP_123.jpg";
    expect(normalizeSourceImageUrl(url)).toBe(url);
  });
});
