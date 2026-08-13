import { describe, expect, it, vi } from "vitest";
import { searchShopeeOfficialV1 } from "@/lib/trends/shopee-search-adapter";

describe("Shopee V1 Engine Security Test (T44)", () => {
  it("Sanitiza erros GraphQL impedindo vazamento de dados internos", async () => {
    vi.stubEnv('SHOPEE_APP_ID', 'test_app_id');
    vi.stubEnv('SHOPEE_APP_SECRET', 'test_app_secret');

    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        data: {
          productOfferV2: null
        },
        errors: [{ message: "Internal Server Error: database connection failed on shopee side" }]
      })
    });

    try {
      // O erro interno "Internal Server Error..." deve ser ocultado
      await expect(searchShopeeOfficialV1("galaxy", "celulares"))
        .rejects.toThrow(/^Shopee OpenAPI V1 HTTP 200$/);
      
      // Verifica timeout (AbortSignal deve estar presente na chamada)
      const fetchCalls = (global.fetch as any).mock.calls;
      expect(fetchCalls.length).toBeGreaterThan(0);
      const fetchOptions = fetchCalls[0][1];
      expect(fetchOptions.signal).toBeDefined();
      expect(fetchOptions.headers.Authorization).toBeDefined();

      // Confirma que 'test_app_secret' não vaza no authorization header (somente app_id)
      expect(fetchOptions.headers.Authorization).toContain("Credential=test_app_id");
      expect(fetchOptions.headers.Authorization).not.toContain("test_app_secret");

    } finally {
      global.fetch = globalFetch;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });

  it("Lança exceção genérica no caso de falha HTTP 429", async () => {
    vi.stubEnv('SHOPEE_APP_ID', 'test_app_id');
    vi.stubEnv('SHOPEE_APP_SECRET', 'test_app_secret');

    const globalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      status: 429,
      json: async () => ({ message: "Too many requests" })
    });

    try {
      await expect(searchShopeeOfficialV1("galaxy", "celulares"))
        .rejects.toThrow("Shopee OpenAPI V1 HTTP 429");
    } finally {
      global.fetch = globalFetch;
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    }
  });
});
