import { buildGeminiVideoPrompt } from "@/lib/videos/gemini-prompt";
import { describe, expect, it } from "vitest";

function extractIdentityRules(prompt: string) {
  const match = prompt.match(/REGRA CRÍTICA — PRESERVAÇÃO EXATA DO PRODUTO\n\n([\s\S]*?)\n\nPERSONAGEM:/u);
  return match?.[0] ?? "";
}

describe("Gemini product identity prompt", () => {
  it("inclui a estrutura fixa de preservação visual do produto", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Parafusadeira Furadeira de Impacto 21V",
      current_price: 123.9,
      category: "Ferramentas",
    });

    expect(prompt).toContain("REGRA CRÍTICA — PRESERVAÇÃO EXATA DO PRODUTO");
    expect(prompt).toContain("A imagem anexada é a referência visual absoluta do produto.");
    expect(prompt).toContain("TEXTOS, LOGOTIPOS, NÚMEROS E ETIQUETAS");
    expect(prompt).toContain("REGRA DE PRIORIDADE");
    expect(prompt).toContain("CONSISTÊNCIA ENTRE FRAMES");
    expect(prompt).toContain("NÃO GERAR NOVOS TEXTOS");
    expect(prompt).toContain("MOVIMENTO DE CÂMERA PARA MAIOR FIDELIDADE");
    expect(prompt).toContain("DURANTE A UTILIZAÇÃO");
    expect(prompt).toContain("REGRA FINAL");
    expect(prompt).toContain("IMAGE-TO-VIDEO COM PRESERVAÇÃO DE IDENTIDADE DO PRODUTO.");
    expect(prompt).toContain("“FALASCA” → “FALACA”");
    expect(prompt).toContain("“21V” → “24V”");
    expect(prompt).toContain("O único texto permitido no vídeo é aquele já existente fisicamente no produto da imagem de referência.");
  });

  it("mantém as regras críticas idênticas ao trocar o produto", () => {
    const toolPrompt = buildGeminiVideoPrompt({
      product_name: "Parafusadeira Furadeira de Impacto 21V",
      current_price: 123.9,
      category: "Ferramentas",
    });
    const phonePrompt = buildGeminiVideoPrompt({
      product_name: "Smartphone Samsung Galaxy A55 256GB",
      current_price: 1999,
      category: "Tecnologia",
    });

    expect(extractIdentityRules(toolPrompt)).not.toBe("");
    expect(extractIdentityRules(toolPrompt)).toBe(extractIdentityRules(phonePrompt));
  });
});
