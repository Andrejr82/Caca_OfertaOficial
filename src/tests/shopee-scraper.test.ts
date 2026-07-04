import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { scrapeProductDetails } from "@/lib/affiliates/scraper";

vi.mock("@/lib/ai/groq", () => ({
  callLLM: vi.fn().mockResolvedValue(JSON.stringify({
    title: "Camiseta Dry Fit Masculina Shopee",
    image: "https://cf.shopee.com.br/file/img1",
    current_price: 39.90,
    old_price: 79.90
  }))
}));

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

  it("deve retornar null se a chave FIRECRAWL_API_KEY não estiver definida", async () => {
    process.env.FIRECRAWL_API_KEY = "";
    
    const result = await scrapeProductDetails("https://shopee.com.br/produto-teste-i.123.456");
    
    expect(result).toBeNull();
  });

  it("deve tentar raspar e estruturar os dados usando a Oracle API e IA se a chave estiver configurada", async () => {
    process.env.ORACLE_API_KEY = "oracle-fake-key";
    process.env.GROQ_API_KEY = "groq-fake-key";

    // Simula resposta com sucesso da Oracle API
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: { text: "HTML mockado da página. <a href='link'>Link</a> <img src='img'> r$ 10.00 price valor " + "x".repeat(1000) }
      })
    });

    const result = await scrapeProductDetails("https://shopee.com.br/dry-fit-i.123.456");

    expect(result).not.toBeNull();
    expect(result?.product_name).toBe("Camiseta Dry Fit Masculina Shopee");
    expect(result?.current_price).toBe(39.90);
    expect(result?.old_price).toBe(79.90);
    expect(result?.image_url).toBe("https://cf.shopee.com.br/file/img1");
  });

  it("deve retornar null em caso de erro definitivo da Oracle API", async () => {
    process.env.ORACLE_API_KEY = "oracle-fake-key";

    // Simula falha nas tentativas
    (global.fetch as any).mockRejectedValue(new Error("Timeout ou rede indisponível"));

    const result = await scrapeProductDetails("https://shopee.com.br/dry-fit-i.123.456");

    expect(result).toBeNull();
  });
});
