import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { scrapeProductDetails } from "@/lib/affiliates/scraper";

describe("Shopee Scraper - Validação do Fluxo de Detalhes", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.FIRECRAWL_API_KEY;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.FIRECRAWL_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  it("deve retornar mock de fallback seguro se a chave FIRECRAWL_API_KEY não estiver definida", async () => {
    process.env.FIRECRAWL_API_KEY = "";
    
    const result = await scrapeProductDetails("https://shopee.com.br/produto-teste-i.123.456");
    
    expect(result).not.toBeNull();
    expect(result?.product_name).toContain("Shopee");
    expect(result?.current_price).toBe(99.90);
  });

  it("deve tentar raspar e estruturar os dados usando a API do Firecrawl se a chave estiver configurada", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-fake-key";

    // Simula resposta com sucesso da API do Firecrawl
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          extract: {
            title: "Camiseta Dry Fit Masculina Shopee",
            image: "https://cf.shopee.com.br/file/img1",
            current_price: 39.90,
            old_price: 79.90
          }
        }
      })
    });

    const result = await scrapeProductDetails("https://shopee.com.br/dry-fit-i.123.456");

    expect(result).not.toBeNull();
    expect(result?.product_name).toBe("Camiseta Dry Fit Masculina Shopee");
    expect(result?.current_price).toBe(39.90);
    expect(result?.old_price).toBe(79.90);
    expect(result?.image_url).toBe("https://cf.shopee.com.br/file/img1");
  });

  it("deve acionar o fallback controlado em caso de erro definitivo do Firecrawl", async () => {
    process.env.FIRECRAWL_API_KEY = "fc-fake-key";

    // Simula falha do Firecrawl nas tentativas
    (global.fetch as any).mockRejectedValue(new Error("Timeout ou rede indisponível"));

    const result = await scrapeProductDetails("https://shopee.com.br/dry-fit-i.123.456");

    expect(result).not.toBeNull();
    expect(result?.product_name).toContain("Fallback");
    expect(result?.current_price).toBe(49.99);
  });
});
