import { describe, expect, it } from "vitest";
import {
  parseSheinExpressProduct,
  type SheinManualConfirmation,
} from "@/lib/publish/shein-express-adapter";

const directUrl = "https://br.shein.com/Camiseta-Basica-p-123456789-cat-1001.html";

describe("Shein Express Adapter", () => {
  it("accepts a direct canonical product URL with product identity", () => {
    const result = parseSheinExpressProduct({
      inputUrl: directUrl,
      resolvedUrl: directUrl,
      html: `
        <meta property="og:title" content="Camiseta Básica">
        <meta property="og:image" content="https://img.ltwebstatic.com/product.jpg">
        <meta property="product:price:amount" content="39.90">
      `,
    });

    expect(result).toMatchObject({
      canonicalUrl: directUrl,
      productId: "123456789",
      title: "Camiseta Básica",
      price: 39.9,
      imageUrl: "https://img.ltwebstatic.com/product.jpg",
    });
  });

  it("resolves an OneLink embedded product URL without using campaign title", () => {
    const oneLink = "https://onelink.shein.com/46/5yac8yoeq9ek?shc=2_RSsqGOruYeo";
    const result = parseSheinExpressProduct({
      inputUrl: oneLink,
      resolvedUrl: oneLink,
      html: `
        <title>Não perca esta oferta grande na SHEIN!</title>
        <input id="url" value="${directUrl}?onelink=46%2F5yac8yoeq9ek">
        <meta property="og:image" content="https://img.ltwebstatic.com/landing.jpg">
      `,
      productHtml: `
        <meta property="og:title" content="Camiseta Básica">
        <meta property="og:image" content="https://img.ltwebstatic.com/product.jpg">
        <meta property="product:price:amount" content="39.90">
      `,
    });

    expect(result.canonicalUrl).toBe(directUrl);
    expect(result.productId).toBe("123456789");
    expect(result.title).toBe("Camiseta Básica");
    expect(result.price).toBe(39.9);
  });

  it("fails closed when the product page is blocked and no manual confirmation exists", () => {
    expect(() => parseSheinExpressProduct({
      inputUrl: directUrl,
      resolvedUrl: directUrl,
      html: "<script>page_risk_crawler_block=true</script>",
    })).toThrowError("SHEIN_PRICE_AMBIGUOUS");
  });

  it("does not select a product from multiple title candidates", () => {
    expect(() => parseSheinExpressProduct({
      inputUrl: "https://www.shein.com/search?keyword=camiseta",
      resolvedUrl: "https://www.shein.com/search?keyword=camiseta",
      html: `
        <title>Camiseta 1</title>
        <a href="/Camiseta-1-p-111-cat-1.html">Camiseta 1</a>
        <a href="/Camiseta-2-p-222-cat-1.html">Camiseta 2</a>
        <meta property="product:price:amount" content="39.90">
      `,
    })).toThrowError("SHEIN_IDENTITY_AMBIGUOUS");
  });

  it("fails closed when the page exposes conflicting prices", () => {
    expect(() => parseSheinExpressProduct({
      inputUrl: directUrl,
      resolvedUrl: directUrl,
      html: `
        <meta property="og:title" content="Camiseta Básica">
        <meta property="og:image" content="https://img.ltwebstatic.com/product.jpg">
        <meta property="product:price:amount" content="39.90">
        <script type="application/ld+json">{"name":"Camiseta Básica","offers":{"price":"49.90"}}</script>
      `,
    })).toThrowError("SHEIN_PRICE_AMBIGUOUS");
  });

  it("fails closed when no strong product identity is linked to the input", () => {
    expect(() => parseSheinExpressProduct({
      inputUrl: "https://www.shein.com/brand/camisetas",
      resolvedUrl: "https://www.shein.com/brand/camisetas",
      html: `
        <meta property="og:title" content="Camiseta Básica">
        <meta property="og:image" content="https://img.ltwebstatic.com/product.jpg">
        <meta property="product:price:amount" content="39.90">
      `,
    })).toThrowError("SHEIN_IDENTITY_AMBIGUOUS");
  });

  it("accepts explicit manual confirmation when automatic extraction is blocked", () => {
    const confirmation: SheinManualConfirmation = {
      title: "Camiseta Básica",
      price: 39.9,
      imageUrl: "https://img.ltwebstatic.com/product.jpg",
    };
    const result = parseSheinExpressProduct({
      inputUrl: directUrl,
      resolvedUrl: directUrl,
      html: "<script>page_risk_crawler_block=true</script>",
      manualConfirmation: confirmation,
    });

    expect(result).toMatchObject({
      productId: "123456789",
      title: confirmation.title,
      price: confirmation.price,
      imageUrl: confirmation.imageUrl,
      priceSource: "MANUAL_CONFIRMATION",
    });
  });
});
