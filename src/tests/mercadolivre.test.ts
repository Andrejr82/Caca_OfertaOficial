import { describe, expect, it, vi, beforeEach } from "vitest";
import { extractMLId, generateMLAffiliateLink, fetchMLProductDetails } from "@/lib/platforms/mercadolivre";

describe("Mercado Livre Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("extractMLId", () => {
    it("should extract item ID from normal product URL", () => {
      const url = "https://produto.mercadolivre.com.br/MLB-3564758373-smartphone-samsung-galaxy-s23-5g-256gb-8gb-ram-_JM";
      const result = extractMLId(url);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("item");
      expect(result?.id).toBe("MLB3564758373");
    });

    it("should extract product ID from catalog product URL", () => {
      const url = "https://www.mercadolivre.com.br/smartphone-samsung-galaxy-s23-5g-256gb-8gb-ram/p/MLB21473210";
      const result = extractMLId(url);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("product");
      expect(result?.id).toBe("MLB21473210");
    });

    it("should extract item ID from search parameter", () => {
      const url = "https://www.mercadolivre.com.br/navigation/redirect?itemId=MLB4447477546";
      const result = extractMLId(url);
      expect(result).not.toBeNull();
      expect(result?.type).toBe("item");
      expect(result?.id).toBe("MLB4447477546");
    });

    it("should return null for non-Mercado Livre URL without ML IDs", () => {
      const url = "https://www.amazon.com.br/dp/B000123";
      const result = extractMLId(url);
      expect(result).toBeNull();
    });
  });

  describe("generateMLAffiliateLink", () => {
    it("should inject tracking parameters when userId is provided", () => {
      const url = "https://produto.mercadolivre.com.br/MLB-123";
      const userId = "user-123";
      const affiliateUrl = generateMLAffiliateLink(url, userId);
      expect(affiliateUrl).toContain("af_sub1=user-123");
      expect(affiliateUrl).toContain("utm_source=afiliado");
    });

    it("should return original URL when userId is missing", () => {
      const url = "https://produto.mercadolivre.com.br/MLB-123";
      const affiliateUrl = generateMLAffiliateLink(url);
      expect(affiliateUrl).toBe(url);
    });
  });

  describe("fetchMLProductDetails", () => {
    it("should fetch item details and parse them correctly", async () => {
      const mockItem = {
        title: "Celular Teste",
        price: 1500,
        original_price: 1800,
        permalink: "https://produto.mercadolivre.com.br/MLB-12345",
        pictures: [{ secure_url: "https://http2.mlstatic.com/D_678-I.jpg" }]
      };

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockItem
      } as Response);

      const metadata = await fetchMLProductDetails("https://produto.mercadolivre.com.br/MLB-12345");
      expect(metadata).not.toBeNull();
      expect(metadata?.title).toBe("Celular Teste");
      expect(metadata?.price).toBe(1500);
      expect(metadata?.imageUrl).toBe("https://http2.mlstatic.com/D_678-O.jpg"); // Check high-resolution replacement
      expect(metadata?.platform).toBe("Mercado Livre");
      expect(metadata?.imageSource).toBe("mercadolivre_api");
    });

    it("should fetch catalog product details and parse them correctly", async () => {
      const mockProduct = {
        name: "Celular Catalogo Teste",
        permalink: "https://www.mercadolivre.com.br/p/MLB21473210",
        buy_box_winner: { price: 2500 },
        pictures: [{ url: "https://http2.mlstatic.com/D_999-I.jpg" }]
      };

      vi.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        json: async () => mockProduct
      } as Response);

      const metadata = await fetchMLProductDetails("https://www.mercadolivre.com.br/p/MLB21473210");
      expect(metadata).not.toBeNull();
      expect(metadata?.title).toBe("Celular Catalogo Teste");
      expect(metadata?.price).toBe(2500);
      expect(metadata?.imageUrl).toBe("https://http2.mlstatic.com/D_999-O.jpg");
      expect(metadata?.platform).toBe("Mercado Livre");
    });
  });
});
