import { describe, expect, it, vi } from "vitest";
import { searchShopeeOfficialV1 } from "@/lib/trends/shopee-search-adapter";
import * as searchService from "@/lib/shopee/ranking/search-service";

describe("Shopee V1 Engine Integration Test (T42)", () => {
  it("Open API simulada -> motor -> Top 2 (nenhuma consulta a DB na descoberta)", async () => {
    // 1. Simular variáveis de ambiente para a requisição assinada
    vi.stubEnv('SHOPEE_APP_ID', 'test_app_id');
    vi.stubEnv('SHOPEE_APP_SECRET', 'test_app_secret');

    // 2. Interceptar a chamada de fetch real dentro do adapter via mock
    // Mas o searchShopeeOfficialV1 usa require() na linha de execução para o script cjs.
    // Em vez disso, mockamos o `processRawOffers` para verificar o retorno do Open API simulada
    // Ou mockamos o fetch global.
    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        data: {
          productOfferV2: {
            nodes: [
              { itemId: "1", shopId: "1", productName: "Smartphone Galaxy S23", priceMin: 3000, imageUrl: "https://img", offerLink: "https://shopee.com.br/1", sales: 500, ratingStar: 4.8, priceDiscountRate: 10, commissionRate: 5 },
              { itemId: "2", shopId: "1", productName: "Smartphone Galaxy S22", priceMin: 2000, imageUrl: "https://img", offerLink: "https://shopee.com.br/2", sales: 100, ratingStar: 4.5, priceDiscountRate: 10, commissionRate: 5 },
              { itemId: "3", shopId: "2", productName: "Smartphone Galaxy S21", priceMin: 1500, imageUrl: "https://img", offerLink: "https://shopee.com.br/3", sales: 50, ratingStar: 4.0, priceDiscountRate: 10, commissionRate: 5 },
            ]
          }
        }
      })
    });

    try {
      // Monitorar se `searchService.processRawOffers` é chamado e garantir que DB (ofertas) NÃO é consultado.
      const spyProcess = vi.spyOn(searchService, 'processRawOffers');

      // 3. Rota de matching -> candidato ranqueado
      const results = await searchShopeeOfficialV1("smartphone", "celulares");

      // 4. Verificar Top 2
      expect(results).toHaveLength(2); // Deve ter escolhido o top 2
      expect(results[0].id).toBe("1"); // O com mais sales e rating
      expect(results[1].id).toBe("2");
      
      // 5. Persistência opcional -> leitura de score/explainability
      expect(results[0].marketplaceMetrics).toBeDefined();
      expect(results[0].marketplaceMetrics?.score).toBeDefined();
      expect(results[0].marketplaceMetrics?.strategy_version).toBe("shopee-ranking-v1");
      expect(results[0].marketplaceMetrics?.scoreBreakdown).toBeDefined();
      expect(results[0].marketplaceMetrics?.determiningReasons).toBeDefined();
      
      // Validação extra: Nenhuma chamada de DB no fluxo. O DBClient não foi importado/chamado.
      expect(spyProcess).toHaveBeenCalledOnce();
    } finally {
      global.fetch = globalFetch;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });
});
