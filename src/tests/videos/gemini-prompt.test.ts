import { describe, expect, it } from "vitest";
import { buildGeminiVideoPrompt, classifyGeminiUsabilityCategory, formatLongPriceForSpeech } from "@/lib/videos/gemini-prompt";

describe("Gemini usability video prompt", () => {
  it("gera Reel curto orientado a movimento e sem texto promocional", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Console Portátil R36S 64GB Tela IPS 3.5",
      current_price: 175.99,
      platform: "Shopee",
      category: "Games",
    });

    expect(prompt).toContain("REEL DE USABILIDADE");
    expect(prompt).toContain("aproximadamente 8 segundos");
    expect(prompt).toContain("CATEGORIA: Eletrônicos e games");
    expect(prompt).toContain("O primeiro segundo deve ter ação visual clara");
    expect(prompt).toContain("Sem preço, sem legenda promocional e sem CTA dentro do vídeo");
    expect(prompt).toContain("Sem narração. Sem diálogo. Sem voz humana.");
    expect(prompt).not.toContain("CENA 1");
    expect(prompt).not.toContain("CENA 5");
  });

  it("preserva identidade do produto com restrições curtas", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Mini Máquina de Costura Manual Portátil",
      current_price: 10.99,
      category: "Utilidades",
    });

    expect(prompt).toContain("Use a imagem anexada como referência visual principal do produto");
    expect(prompt).toContain("Mantenha o mesmo produto em todos os frames");
    expect(prompt).toContain("Não inventar acessórios, peças ou textos");
    expect(prompt).toContain("não inventar potência, capacidade, durabilidade, compatibilidade ou acessórios");
  });

  it("classifica serra Makita como ferramenta e prioriza ação desde o início", () => {
    const offer = {
      product_name: "Serra Circular Makita 18V",
      current_price: 799.9,
      category: "Ferramentas",
    };
    const prompt = buildGeminiVideoPrompt(offer);

    expect(classifyGeminiUsabilityCategory(offer)).toBe("ferramentas");
    expect(prompt).toContain("CATEGORIA: Ferramentas");
    expect(prompt).toContain("começar com a ferramenta já em ação ou sendo posicionada para uso");
    expect(prompt).toContain("bancada ou oficina limpa");
    expect(prompt).toContain("não inventar disco, broca, bateria, acessórios");
  });

  it("mantém direção específica de moda", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Vestido Saída de Praia Verde Feminino",
      current_price: 79.9,
      category: "Moda",
    });

    expect(classifyGeminiUsabilityCategory({ product_name: "Vestido Saída de Praia Verde", current_price: 1 })).toBe("moda");
    expect(prompt).toContain("CATEGORIA: Moda e vestuário");
    expect(prompt).toContain("começar com a peça já vestida");
    expect(prompt).toContain("caminhar ou girar levemente");
  });

  it("mantém direção pet sem alegações veterinárias", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Brinquedo Interativo Para Gatos Com Som de Pássaro",
      current_price: 6.54,
      category: "Pet",
    });
    expect(prompt).toContain("CATEGORIA: Pet");
    expect(prompt).toContain("interação natural entre o animal e o produto");
    expect(prompt).toContain("não inventar benefícios veterinários");
  });

  it("mantém direção de limpeza sem prometer eficácia", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Percarbonato de sódio para roupas e limpeza",
      current_price: 28.99,
      category: "Limpeza",
    });
    expect(prompt).toContain("CATEGORIA: Organização e limpeza");
    expect(prompt).toContain("resultado visual moderado");
    expect(prompt).toContain("não inventar desinfecção");
  });

  it("mantém utilitário legado de preço", () => {
    expect(formatLongPriceForSpeech(471.8)).toBe("quatrocentos e setenta e um reais e oitenta centavos");
  });
});
