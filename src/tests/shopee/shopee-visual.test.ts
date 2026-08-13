import { describe, expect, it } from "vitest";
import { searchShopeeOfficialV1 } from "@/lib/trends/shopee-search-adapter";
import * as searchService from "@/lib/shopee/ranking/search-service";
import { vi } from "vitest";

describe("Shopee V1 Engine Visual Consumer Test (T43)", () => {
  it("Garante que os atributos visuais finais estejam corretos e higienizados", async () => {
    vi.stubEnv('SHOPEE_APP_ID', 'test_app_id');
    vi.stubEnv('SHOPEE_APP_SECRET', 'test_app_secret');

    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        data: {
          productOfferV2: {
            nodes: [
              { 
                itemId: "visual_1", 
                shopId: "1", 
                productName: "Smartphone Galaxy S23 Ultra 5G - Cor Preto 256GB", 
                priceMin: 5999.99, 
                imageUrl: "https://shopee.com.br/img/galaxy.jpg", 
                offerLink: "https://shopee.com.br/affiliate/visual_1?utm_source=teste", 
                sales: 1000, 
                ratingStar: 4.9, 
                priceDiscountRate: 15, 
                commissionRate: 5 
              }
            ]
          }
        }
      })
    });

    try {
      const results = await searchShopeeOfficialV1("galaxy", "celulares");

      expect(results).toHaveLength(1);
      
      const visualCandidate = results[0];

      // Verificação Visual 1: Identidade (Título sanitizado/mapeado)
      expect(visualCandidate.productName).toBe("Smartphone Galaxy S23 Ultra 5G - Cor Preto 256GB");
      
      // Verificação Visual 2: Imagem
      expect(visualCandidate.marketplaceMetrics?.imageUrl).toBe("https://shopee.com.br/img/galaxy.jpg");
      
      // Verificação Visual 3: Link de Afiliado (Higienizado, sem credenciais expostas indevidamente)
      expect(visualCandidate.permalink).toContain("https://shopee.com.br/affiliate/visual_1");
      
      // Verificação Visual 4: Preço
      expect(visualCandidate.currentPrice).toBe(5999.99);

      // Verificação Visual 5: Confirmação de que campos internos do Shopee não vazam para a raiz
      expect((visualCandidate as any).commissionRate).toBeUndefined();
      expect((visualCandidate as any).sales).toBeUndefined();

      // Guardar fixture sanitizada para o teste (representando o step 'Guardar somente fixtures sanitizadas')
      const sanitizedFixture = JSON.stringify(visualCandidate, null, 2);
      expect(sanitizedFixture).toContain('"productName"');
      expect(sanitizedFixture).toContain('"imageUrl"');
      expect(sanitizedFixture).not.toContain('test_app_secret');

    } finally {
      global.fetch = globalFetch;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });
});
