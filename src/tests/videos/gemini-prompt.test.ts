import { describe, expect, it } from "vitest";
import { buildGeminiVideoPrompt, classifyGeminiUsabilityCategory, formatLongPriceForSpeech } from "@/lib/videos/gemini-prompt";

describe("Gemini usability video prompt", () => {
  it("gera prompt de usabilidade sem avatar, narração ou texto promocional", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Console Portátil R36S 64GB Tela IPS 3.5",
      current_price: 175.99,
      platform: "Shopee",
      category: "Games",
    });

    expect(prompt).toContain("VÍDEO DE USABILIDADE DO PRODUTO");
    expect(prompt).toContain("aproximadamente 15 segundos");
    expect(prompt).toContain("CATEGORIA DE ROTEIRO: Eletrônicos e games");
    expect(prompt).toContain("SEM AVATAR OFERTANDO");
    expect(prompt).toContain("SEM NARRAÇÃO");
    expect(prompt).toContain("SEM TEXTOS PROMOCIONAIS");
    expect(prompt).toContain("APENAS MÚSICA INSTRUMENTAL DE FUNDO");
    expect(prompt).not.toContain("Avatar_Silvia");
    expect(prompt).not.toContain("FALA EXATA");
  });

  it("preserva identidade do produto e impede invenção de recursos", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Mini Máquina de Costura Manual Portátil",
      current_price: 10.99,
      category: "Utilidades",
    });

    expect(prompt).toContain("REFERÊNCIA VISUAL PRINCIPAL, ABSOLUTA E OBRIGATÓRIA");
    expect(prompt).toContain("MESMO OBJETO FÍSICO");
    expect(prompt).toContain("NÃO inventar acessórios");
    expect(prompt).toContain("não inventar potência, capacidade, durabilidade, compatibilidade");
    expect(prompt).toContain("CENA 3 — 6–9s — USABILIDADE PRINCIPAL");
  });

  it("usa roteiro específico de moda com foco em caimento", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Vestido Saída de Praia Verde Feminino",
      current_price: 79.9,
      category: "Moda",
    });

    expect(classifyGeminiUsabilityCategory({ product_name: "Vestido Saída de Praia Verde", current_price: 1 })).toBe("moda");
    expect(prompt).toContain("CATEGORIA DE ROTEIRO: Moda e vestuário");
    expect(prompt).toContain("caimento, proporções, comprimento");
    expect(prompt).toContain("caminhando suavemente");
    expect(prompt).toContain("não inventar parte traseira complexa");
  });

  it("usa roteiro pet baseado em interação natural", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Brinquedo Interativo Para Gatos Com Som de Pássaro",
      current_price: 6.54,
      category: "Pet",
    });
    expect(prompt).toContain("CATEGORIA DE ROTEIRO: Pet");
    expect(prompt).toContain("animal doméstico interagindo naturalmente");
    expect(prompt).toContain("não inventar benefícios veterinários");
  });

  it("usa roteiro de limpeza sem prometer eficácia não observada", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Percarbonato de sódio para roupas e limpeza",
      current_price: 28.99,
      category: "Limpeza",
    });
    expect(prompt).toContain("CATEGORIA DE ROTEIRO: Organização e limpeza");
    expect(prompt).toContain("resultado visual moderado e plausível");
    expect(prompt).toContain("não inventar desinfecção");
  });

  it("mantém utilitário legado de preço", () => {
    expect(formatLongPriceForSpeech(471.8)).toBe("quatrocentos e setenta e um reais e oitenta centavos");
  });
});
