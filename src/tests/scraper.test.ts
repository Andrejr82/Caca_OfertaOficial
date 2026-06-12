import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchTrendingProductsFromLanding, scrapeProductDetails } from "@/lib/affiliates/scraper";

describe("Mercado Livre Scraper", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("extracts trending products correctly from landing page carousel", async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="dynamic-carousel__item-container">
            <a href="https://www.mercadolivre.com.br/product-1/p/MLB123">
              <img src="https://example.com/img1.jpg" alt="Product 1">
              <div class="dynamic-carousel__price-block">
                <span class="dynamic-carousel__price"><span>R$ 100</span></span>
              </div>
              <h3 class="dynamic-carousel__title">Product 1</h3>
            </a>
          </div>
          <div class="dynamic-carousel__item-container">
            <a href="https://www.mercadolivre.com.br/product-2/p/MLB456">
              <img src="https://example.com/img2.jpg" alt="Product 2">
              <div class="dynamic-carousel__price-block">
                <span class="dynamic-carousel__price"><span>R$ 200</span></span>
              </div>
              <h3 class="dynamic-carousel__title">Product 2</h3>
            </a>
          </div>
        </body>
      </html>
    `;

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => mockHtml
    } as Response);

    const products = await fetchTrendingProductsFromLanding(2);
    expect(products).toHaveLength(2);
    expect(products[0].product_name).toBe("Product 1");
    expect(products[0].current_price).toBe(100);
    expect(products[0].original_url).toContain("MLB123");
    expect(products[1].product_name).toBe("Product 2");
    expect(products[1].current_price).toBe(200);
  });

  it("scrapes product details correctly using JSON-LD", async () => {
    const mockLdJson = {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Fone Bluetooth ANC Premium",
      "offers": {
        "@type": "Offer",
        "price": 149.90,
        "priceCurrency": "BRL"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": 4.8
      }
    };

    const mockHtml = `
      <html>
        <head>
          <meta property="og:title" content="Fone Bluetooth ANC Premium - Og Title">
          <meta property="og:image" content="https://http2.mlstatic.com/D_1234-O.jpg">
          <script type="application/ld+json">${JSON.stringify(mockLdJson)}</script>
        </head>
        <body>
          <span class="ui-pdp-price__original-value">
            <span class="andes-money-amount__fraction">199</span>
          </span>
        </body>
      </html>
    `;

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      text: async () => mockHtml
    } as Response);

    const details = await scrapeProductDetails("https://produto.mercadolivre.com.br/MLB-12345");
    expect(details).not.toBeNull();
    if (details) {
      expect(details.product_name).toBe("Fone Bluetooth ANC Premium - Og Title");
      expect(details.current_price).toBe(149.90);
      expect(details.old_price).toBe(199.00);
      expect(details.rating).toBe(4.8);
      expect(details.image_url).toBe("https://http2.mlstatic.com/D_1234-O.jpg");
    }
  });
});
