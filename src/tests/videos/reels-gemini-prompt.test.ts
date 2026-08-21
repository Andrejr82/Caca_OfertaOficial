import { describe, expect, it } from "vitest";
import { buildReelsGeminiPrompt } from "@/lib/videos/reels-gemini-prompt";

describe("Reels Gemini prompt", () => {
  it("gera prompt curto de 8 segundos orientado a ação", () => {
    const prompt = buildReelsGeminiPrompt({ product_name: "Console Portátil R36S", platform: "Shopee" });
    expect(prompt).toContain("aproximadamente 8 segundos");
    expect(prompt).toContain("O primeiro segundo deve ter ação visual clara");
    expect(prompt).toContain("Sem preço, sem texto promocional e sem CTA dentro do vídeo");
    expect(prompt).not.toContain("CENA 1");
    expect(prompt).not.toContain("CENA 5");
  });

  it("trata serra Makita como ferramenta", () => {
    const prompt = buildReelsGeminiPrompt({ product_name: "Serra Circular Makita 18V", platform: "Shopee" });
    expect(prompt).toContain("Comece com a ferramenta já sendo posicionada ou usada");
    expect(prompt).toContain("bancada ou oficina limpa");
    expect(prompt).toContain("Não invente disco, broca, bateria, acessórios");
  });

  it("mantém fidelidade e proíbe elementos comerciais dentro do vídeo", () => {
    const prompt = buildReelsGeminiPrompt({ product_name: "Liquidificador 3L", platform: "Amazon" });
    expect(prompt).toContain("Mantenha exatamente o mesmo produto em todos os frames");
    expect(prompt).toContain("Não redesenhe, substitua ou estilize o produto");
    expect(prompt).toContain("Sem narração, diálogo ou voz humana");
    expect(prompt).toContain("sem CTA dentro do vídeo");
  });
});
