import { describe, expect, it } from "vitest";
import { buildGeminiVideoPrompt, classifyGeminiUsabilityCategory, formatLongPriceForSpeech } from "@/lib/videos/gemini-prompt";

describe("Gemini usability video prompt", () => {
  it("gera prompt de usabilidade sem avatar ofertando e com direção criativa de conversão", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Console Portátil R36S 64GB Tela IPS 3.5",
      current_price: 175.99,
      platform: "Shopee",
      category: "Games",
    });

    expect(prompt).toContain("VÍDEO DE USABILIDADE DO PRODUTO");
    expect(prompt).toContain("aproximadamente 15 segundos");
    expect(prompt).toContain("DIREÇÃO CRIATIVA DE CONVERSÃO — PRIORIDADE ALTA");
    expect(prompt).toContain("ação deve começar no primeiro segundo");
    expect(prompt).toContain("não usar abertura de catálogo");
    expect(prompt).toContain("SEM AVATAR OFERTANDO");
    expect(prompt).toContain("SEM NARRAÇÃO");
  });

  it("para tênis, força uso no pé e câmera acompanhando movimento", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Tênis Para Corrida Masculino Amortecimento Macio e Super Leve Treino e Caminhada",
      current_price: 104.4,
      platform: "Amazon",
      category: "Esporte",
    });

    expect(prompt).toContain("ARQUÉTIPO: Calçado em movimento");
    expect(prompt).toContain("calçado sendo colocado no pé ou com o primeiro passo em movimento");
    expect(prompt).toContain("câmera baixa acompanhando os pés");
    expect(prompt).toContain("não mostrar avatar parado, segurando o calçado para a câmera");
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
  });

  it("usa roteiro específico de moda com foco em caimento", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Vestido Saída de Praia Verde Feminino",
      current_price: 79.9,
      category: "Moda",
    });

    expect(classifyGeminiUsabilityCategory({ product_name: "Vestido Saída de Praia Verde", current_price: 1 })).toBe("moda");
    expect(prompt).toContain("caimento, proporções, comprimento");
    expect(prompt).toContain("ARQUÉTIPO: Moda em uso");
    expect(prompt).toContain("pessoa já vestindo a peça e entrando em movimento");
  });

  it("usa roteiro pet baseado em interação natural", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Brinquedo Interativo Para Gatos Com Som de Pássaro",
      current_price: 6.54,
      category: "Pet",
    });
    expect(prompt).toContain("CATEGORIA DE ROTEIRO: Pet");
    expect(prompt).toContain("animal doméstico interagindo naturalmente");
    expect(prompt).toContain("ARQUÉTIPO: Pet em interação");
  });

  it("mantém utilitário legado de preço", () => {
    expect(formatLongPriceForSpeech(471.8)).toBe("quatrocentos e setenta e um reais e oitenta centavos");
  });
});
