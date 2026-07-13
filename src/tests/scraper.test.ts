import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { scrapeProductDetails } from "@/lib/affiliates/scraper";

const scraperSource = readFileSync(resolve(process.cwd(), "src/lib/affiliates/scraper.ts"), "utf8");

async function loadMercadoLivreGate() {
  try {
    return await import("@/lib/offers/mercadolivre-manual-curation");
  } catch {
    return null;
  }
}

describe("Mercado Livre V5 runtime cleanup", () => {
  it("removes legacy Trends runner and Mercado Livre branch from shared ingestion", async () => {
    const scraper = await import("@/lib/affiliates/scraper");

    expect((scraper as Record<string, unknown>).fetchTrendingProductsFromLanding).toBeUndefined();
    expect(scraperSource).not.toContain('[MERCADO LIVRE][TRENDS]');
    expect(scraperSource).not.toContain('source === "Mercado Livre"');
  });

  it("blocks Mercado Livre item-detail scraping", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ title: "Legado", price: 10, permalink: "https://produto.mercadolivre.com.br/MLB-1" })
    }));

    await expect(scrapeProductDetails("https://produto.mercadolivre.com.br/MLB-1")).resolves.toBeNull();
  });

  it("requires Mercado Livre selected before copy generation", async () => {
    const gate = await loadMercadoLivreGate();

    expect(gate?.assertMercadoLivreSelected).toBeTypeOf("function");
    expect(() => gate?.assertMercadoLivreSelected({ platform: "Mercado Livre", status: "pending_manual_review" })).toThrow(/seleção manual/i);
    expect(() => gate?.assertMercadoLivreSelected({ platform: "Mercado Livre", status: "rejected" })).toThrow(/seleção manual/i);
    expect(() => gate?.assertMercadoLivreSelected({ platform: "Mercado Livre", status: "posted" })).toThrow(/seleção manual/i);
    expect(() => gate?.assertMercadoLivreSelected({ platform: "Mercado Livre", status: "desconhecido" })).toThrow(/seleção manual/i);
    expect(() => gate?.assertMercadoLivreSelected({ platform: "Mercado Livre", status: "selected" })).not.toThrow();
  });

  it("does not gate Shopee or Amazon in Mercado Livre guard", async () => {
    const gate = await loadMercadoLivreGate();

    expect(() => gate?.assertMercadoLivreSelected({ platform: "Shopee", status: "pending_manual_review" })).not.toThrow();
    expect(() => gate?.assertMercadoLivreSelected({ platform: "Amazon", status: "draft" })).not.toThrow();
  });
});
