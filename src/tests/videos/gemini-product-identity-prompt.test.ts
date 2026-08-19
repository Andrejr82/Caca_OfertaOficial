import { buildGeminiVideoPrompt } from "@/lib/videos/gemini-prompt";
import { describe, expect, it } from "vitest";

function extractIdentityRules(prompt: string) {
  const match = prompt.match(/REGRA CRÍTICA — IDENTIDADE E FIDELIDADE DO PRODUTO\n\n([\s\S]*?)\n\n1\. CONFIGURAÇÃO DO VÍDEO/u);
  return match?.[0] ?? "";
}

describe("Gemini product identity prompt", () => {
  it("inclui a estrutura fixa de preservação visual do produto", () => {
    const prompt = buildGeminiVideoPrompt({
      product_name: "Parafusadeira Furadeira de Impacto 21V",
      current_price: 123.9,
      category: "Ferramentas",
    });

    expect(prompt).toContain("REGRA CRÍTICA — IDENTIDADE E FIDELIDADE DO PRODUTO");
    expect(prompt).toContain("REFERÊNCIA VISUAL PRINCIPAL, ABSOLUTA E OBRIGATÓRIA");
    expect(prompt).toContain("MESMO OBJETO FÍSICO");
    expect(prompt).toContain("textos, logotipos, números, etiquetas e símbolos");
    expect(prompt).toContain("NÃO redesenhar, substituir, estilizar ou \"melhorar\" o produto");
    expect(prompt).toContain("NÃO inventar acessórios, peças, embalagens, marcas, textos, recursos ou componentes ausentes");
    expect(prompt).toContain("Se houver conflito entre estética cinematográfica e fidelidade, preservar o produto");
  });

  it("mantém as regras críticas idênticas ao trocar o produto", () => {
    const toolPrompt = buildGeminiVideoPrompt({ product_name: "Parafusadeira Furadeira de Impacto 21V", current_price: 123.9, category: "Ferramentas" });
    const phonePrompt = buildGeminiVideoPrompt({ product_name: "Smartphone Samsung Galaxy A55 256GB", current_price: 1999, category: "Tecnologia" });
    expect(extractIdentityRules(toolPrompt)).not.toBe("");
    expect(extractIdentityRules(toolPrompt)).toBe(extractIdentityRules(phonePrompt));
  });
});
