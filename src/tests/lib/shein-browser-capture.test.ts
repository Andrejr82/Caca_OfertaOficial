import { describe, expect, it } from "vitest";
import {
  SHEIN_BROWSER_CAPTURE_SNIPPET,
  parseSheinCapturedImages,
} from "@/lib/publish/shein-browser-capture";

describe("Shein browser-assisted image capture", () => {
  it("parses captured DOM images and preselects Visão 1", () => {
    const result = parseSheinCapturedImages(JSON.stringify({
      pageUrl: "https://br.shein.com/Produto-p-511549244-cat-2093.html",
      images: [
        { src: "https://img.ltwebstatic.com/banner.jpg", alt: "banner", naturalWidth: 1600, naturalHeight: 300 },
        { src: "https://img.ltwebstatic.com/product-2.jpg", alt: "Tênis Visão 2", naturalWidth: 900, naturalHeight: 900 },
        { src: "https://img.ltwebstatic.com/product-1.jpg", alt: "Tênis Visão 1", naturalWidth: 900, naturalHeight: 900 },
      ],
    }));

    expect(result.productId).toBe("511549244");
    expect(result.images[0].url).toBe("https://img.ltwebstatic.com/product-1.jpg");
    expect(result.images.map((image) => image.url)).not.toContain("https://img.ltwebstatic.com/banner.jpg");
  });

  it("accepts a different product page without using the first product identity", () => {
    const result = parseSheinCapturedImages(JSON.stringify({
      pageUrl: "https://br.shein.com/Outro-Produto-p-111711285-cat-2090.html",
      images: [{ src: "https://img.ltwebstatic.com/other.jpg", alt: "Outro produto", naturalWidth: 1024, naturalHeight: 1024 }],
    }));

    expect(result.productId).toBe("111711285");
    expect(result.images[0].url).toContain("other.jpg");
  });

  it("rejects malformed or unsafe payloads", () => {
    expect(() => parseSheinCapturedImages("not-json")).toThrow("SHEIN_CAPTURE_INVALID_JSON");
    expect(() => parseSheinCapturedImages(JSON.stringify({ pageUrl: "https://br.shein.com/Produto-p-511549244.html", images: [{ src: "javascript:alert(1)" }] }))).toThrow("SHEIN_CAPTURE_NO_IMAGES");
  });

  it("exposes a console snippet limited to rendered image fields", () => {
    expect(SHEIN_BROWSER_CAPTURE_SNIPPET).toContain("document.images");
    expect(SHEIN_BROWSER_CAPTURE_SNIPPET).toContain("naturalWidth");
    expect(SHEIN_BROWSER_CAPTURE_SNIPPET).toContain("navigator.clipboard");
    expect(SHEIN_BROWSER_CAPTURE_SNIPPET).not.toContain("document.cookie");
    expect(SHEIN_BROWSER_CAPTURE_SNIPPET).not.toContain("localStorage");
  });
});
