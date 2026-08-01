import { buildGeminiVideoPrompt } from "@/lib/videos/gemini-prompt";

describe("Gemini video prompt", () => {
  it("gera fala comercial factual sem instruções de link ou condições", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Batedor Manual de Ovos",
      current_price: 56.9,
      old_price: 59.9,
      platform: "Mercado Livre",
      category: "Utensílios de cozinha",
      shipping_free: true,
    });

    expect(prompt).toContain("gancho → produto → preço verificado → contexto da categoria → CTA suave");
    expect(prompt).toContain("por R$ 56,90, com 5% de desconto verificado");
    expect(prompt).toContain("Toque na publicação para conhecer");
    expect(prompt).not.toContain("Confira as condições da oferta no link");
    expect(prompt).toContain("Não diga “confira as condições”");
    expect(prompt).toContain("Não criar características, resultados, comparações ou promessas");
  });

  it("omite desconto quando não há preço anterior verificável", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Organizador de mesa",
      current_price: 31.96,
      old_price: null,
      platform: "Amazon",
    });

    expect(prompt).toContain("por R$ 31,96");
    expect(prompt).not.toContain("desconto verificado");
  });
});
