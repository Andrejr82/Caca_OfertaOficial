import { describe, expect, it } from "vitest";
import {
  discoverSheinImages,
  extractSheinProductId,
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
        <meta property="og:image" content="https://img.ltwebstatic.com/images3_ccc/global-flag.png">
        <img src="https://img.ltwebstatic.com/banner/home-sale.jpg">
        <img src="https://img.ltwebstatic.com/products/511549244/main.jpg">
      `,
      validateImage: imageValidator,
    });

    expect(result.rejectedAssets).toEqual(expect.arrayContaining([
      "https://img.ltwebstatic.com/images3_ccc/global-flag.png",
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

  it("does not harvest images from a challenge page", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-p-555555-cat-1.html",
      productId: "555555",
      html: `<script>window.location='/risk/challenge?captcha_type=903'</script><img src="https://img.ltwebstatic.com/challenge.jpg">`,
      validateImage: imageValidator,
    });

    expect(result.validProductImages).toEqual([]);
    expect(result.fallbackRequired).toBe(true);
  });

  it("preselects generic gallery Visão 1 over Visão 2 and a larger banner", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-A-p-111111-cat-1.html",
      productId: "111111",
      html: `
        <img src="https://img.ltwebstatic.com/products/a-banner.jpg" alt="banner" width="1600" height="300">
        <img src="https://img.ltwebstatic.com/products/a-2.jpg" alt="Produto A Visão 2" width="900" height="900">
        <img src="https://img.ltwebstatic.com/products/a-1.jpg" alt="Produto A Visão 1" width="900" height="900">
      `,
      imageMetadata: {
        "https://img.ltwebstatic.com/products/a-1.jpg": { width: 900, height: 900 },
        "https://img.ltwebstatic.com/products/a-2.jpg": { width: 900, height: 900 },
      },
      validateImage: imageValidator,
    });

    expect(result.validProductImages[0].url).toBe("https://img.ltwebstatic.com/products/a-1.jpg");
    expect(result.validProductImages.map((candidate) => candidate.url)).not.toContain("https://img.ltwebstatic.com/products/a-banner.jpg");
  });

  it("does not select gallery assets explicitly belonging to another product", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-B-p-222222-cat-1.html",
      productId: "222222",
      html: `
        <img data-product-id="111111" src="https://img.ltwebstatic.com/products/a-1.jpg" alt="Produto A Visão 1" width="900" height="900">
        <img data-product-id="222222" src="https://img.ltwebstatic.com/products/b-1.jpg" alt="Produto B" width="900" height="900">
      `,
      imageMetadata: {
        "https://img.ltwebstatic.com/products/a-1.jpg": { width: 900, height: 900 },
        "https://img.ltwebstatic.com/products/b-1.jpg": { width: 900, height: 900 },
      },
      validateImage: imageValidator,
    });

    expect(result.validProductImages.map((candidate) => candidate.url)).toEqual([
      "https://img.ltwebstatic.com/products/b-1.jpg",
    ]);
  });

  it("accepts a valid gallery without Visão labels", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-C-p-333333-cat-1.html",
      productId: "333333",
      html: `<img src="https://img.ltwebstatic.com/v4/j/spmp/product-c.jpg" alt="Bolsa feminina em couro" width="1024" height="1024">`,
      imageMetadata: { "https://img.ltwebstatic.com/v4/j/spmp/product-c.jpg": { width: 1024, height: 1024 } },
      validateImage: imageValidator,
    });

    expect(result.validProductImages[0].url).toContain("product-c.jpg");
  });

  it("rejects empty/icon alt and leaves manual fallback when nothing reliable remains", async () => {
    const result = await discoverSheinImages({
      canonicalUrl: "https://br.shein.com/Produto-D-p-444444-cat-1.html",
      productId: "444444",
      html: `
        <img src="https://img.ltwebstatic.com/icon.jpg" alt="icon" width="1024" height="1024">
        <img src="https://img.ltwebstatic.com/empty.jpg" alt="" width="100" height="100">
      `,
      imageMetadata: { "https://img.ltwebstatic.com/empty.jpg": { width: 100, height: 100 } },
      validateImage: imageValidator,
    });

    expect(result.validProductImages).toEqual([]);
    expect(result.fallbackRequired).toBe(true);
  });
});
