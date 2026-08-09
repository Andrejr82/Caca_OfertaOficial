import { describe, expect, it } from "vitest";
import {
  discoverSheinImages,
  extractSheinProductId,
  SHEIN_REJECTED_IMAGE_URL,
} from "@/lib/publish/shein-image-discovery";

const imageValidator = async (url: string) => !url.includes("invalid");

describe("Shein automatic image discovery", () => {
  it("attempts OneLink images without inventing product identity", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://onelink.shein.com/46/ambiguous",
      html: `<meta property="og:image" content="https://img.ltwebstatic.com/landing.jpg">`,
      validateImage: imageValidator,
    });

    expect(result.sourcesTested[0]).toBe("og:image");
    expect(result.candidates).toHaveLength(1);
    expect(result.validProductImages).toHaveLength(0);
  });

  it("keeps productId from canonical p-id URL", () => {
    expect(extractSheinProductId("https://br.shein.com/Produto-p-511549244-cat-2093.html")).toBe("511549244");
  });

  it("accepts valid og:image linked to the same canonical product", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-p-511549244-cat-2093.html",
      productId: "511549244",
      html: `<meta property="og:image" content="https://img.ltwebstatic.com/products/511549244/main.jpg">`,
      validateImage: imageValidator,
    });

    expect(result.validProductImages).toHaveLength(1);
    expect(result.validProductImages[0].source).toBe("og:image");
  });

  it("discovers multiple gallery images from source and srcset", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-p-511549244-cat-2093.html",
      productId: "511549244",
      html: `
        <picture><source srcset="https://img.ltwebstatic.com/products/511549244/a.jpg 1x, https://img.ltwebstatic.com/products/511549244/a@2x.jpg 2x"></picture>
        <img src="https://img.ltwebstatic.com/products/511549244/b.jpg" srcset="https://img.ltwebstatic.com/products/511549244/b-large.jpg 2x">
      `,
      validateImage: imageValidator,
    });

    expect(result.validProductImages.length).toBeGreaterThanOrEqual(3);
    expect(result.validProductImages.every((candidate) => candidate.linkedToProduct)).toBe(true);
  });

  it("rejects the known flag/auxiliary asset and banner-like URLs", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-p-511549244-cat-2093.html",
      productId: "511549244",
      html: `
        <meta property="og:image" content="${SHEIN_REJECTED_IMAGE_URL}">
        <img src="https://img.ltwebstatic.com/banner/home-sale.jpg">
        <img src="https://img.ltwebstatic.com/products/511549244/main.jpg">
      `,
      validateImage: imageValidator,
    });

    expect(result.rejectedAssets).toEqual(expect.arrayContaining([
      SHEIN_REJECTED_IMAGE_URL,
      "https://img.ltwebstatic.com/banner/home-sale.jpg",
    ]));
    expect(result.validProductImages.map((candidate) => candidate.url)).toEqual([
      "https://img.ltwebstatic.com/products/511549244/main.jpg",
    ]);
  });

  it("returns no automatic image when no source is present", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-p-511549244-cat-2093.html",
      productId: "511549244",
      html: "<title>Produto</title>",
      validateImage: imageValidator,
    });

    expect(result.validProductImages).toEqual([]);
    expect(result.candidates).toEqual([]);
  });
});
