import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchLinkMetadata } from "@/lib/publish/scraper";

vi.mock("@/lib/affiliates/scraper", () => ({
  scrapeProductDetails: vi.fn().mockResolvedValue(null)
}));

describe("Publish Scraper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts basic metadata from valid HTML", async () => {
    const mockHtml = `
      <html>
        <head>
          <title>Produto de Teste - Mercado Livre</title>
          <meta property="og:image" content="https://example.com/img.jpg">
          <meta property="product:price:amount" content="99.90">
        </head>
        <body></body>
      </html>
    `;

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      url: "https://produto.mercadolivre.com.br/MLB-12345",
      text: async () => mockHtml
    } as Response);

    const metadata = await fetchLinkMetadata("https://produto.mercadolivre.com.br/MLB-12345");
    
    expect(metadata.title).toBe("Produto de Teste");
    expect(metadata.imageUrl).toBe("https://example.com/img.jpg");
    expect(metadata.price).toBe(99.90);
    expect(metadata.platform).toBe("Mercado Livre");
    expect(metadata.imageSource).toBe("og:image");
  });

  it("extracts price from title if meta tag is missing", async () => {
    const mockHtml = `
      <html>
        <head>
          <title>Smartphone Galaxy S23 - R$ 3499,00</title>
          <meta property="og:image:secure_url" content="https://example.com/secure.jpg">
        </head>
        <body></body>
      </html>
    `;

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      url: "https://www.amazon.com.br/dp/B000123",
      text: async () => mockHtml
    } as Response);

    const metadata = await fetchLinkMetadata("https://www.amazon.com.br/dp/B000123");
    
    expect(metadata.title).toBe("Smartphone Galaxy S23");
    expect(metadata.price).toBe(3499.00);
    expect(metadata.imageSource).toBe("og:image:secure_url");
    expect(metadata.platform).toBe("Amazon");
  });

  it("falls back to schema.org for image", async () => {
    const mockLdJson = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": "TV 4K",
      "image": "https://example.com/schema-img.jpg"
    };

    const mockHtml = `
      <html>
        <head>
          <title>TV 4K</title>
          <script type="application/ld+json">${JSON.stringify(mockLdJson)}</script>
        </head>
        <body>
          <span class="andes-money-amount__fraction">2000</span>
        </body>
      </html>
    `;

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      url: "https://produto.mercadolivre.com.br/MLB",
      text: async () => mockHtml
    } as Response);

    const metadata = await fetchLinkMetadata("https://produto.mercadolivre.com.br/MLB");
    
    expect(metadata.imageUrl).toBe("https://example.com/schema-img.jpg");
    expect(metadata.imageSource).toBe("json-ld");
    expect(metadata.price).toBe(2000);
  });
});
