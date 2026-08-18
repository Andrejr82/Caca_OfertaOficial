import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateInstagramPolicy } from "@/lib/instagram/policy-guard";

describe("Instagram Policy Guard", () => {
  it("allows ordinary retail offers", () => {
    expect(evaluateInstagramPolicy({
      productName: "Smart TV 50 polegadas 4K",
      category: "Eletrônicos",
      platform: "Shopee",
      caption: "Oferta de Smart TV com desconto por tempo limitado. #publi"
    })).toEqual({ ok: true });
  });

  it.each([
    ["Armas", "Pistola calibre 9mm", "weapons_explosives"],
    ["Tabaco", "Kit vape com nicotina", "drugs_tobacco_nicotine"],
    ["Bebidas", "Whisky premium 12 anos", "alcohol"],
    ["Adulto", "Vibrador adulto", "adult_sexual"],
    ["Apostas", "Crédito para cassino online", "gambling"],
    ["Saúde", "Suplemento para perder peso e queima gordura", "pharma_health_claims"],
    ["Animais", "Filhote à venda", "live_animals_wildlife"],
    ["Política", "Material para campanha eleitoral de candidato", "political_government"],
    ["Moda", "Bolsa réplica 1:1", "counterfeit_piracy"]
  ])("blocks sensitive category %s", (category, productName, expectedRule) => {
    const result = evaluateInstagramPolicy({ category, productName, caption: "Confira esta oferta" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INSTAGRAM_POLICY_BLOCKED");
      expect(result.rule).toBe(expectedRule);
      expect(result.message).toMatch(/Publicação bloqueada/);
    }
  });

  it.each([
    ["Pistola de cola quente 60W", "Ferramentas"],
    ["Pistola de pintura elétrica", "Ferramentas"],
    ["Silenciador automotivo universal", "Automotivo"],
    ["Fantasia de pirata infantil", "Fantasias"],
    ["Livro sobre a história da prefeitura de São Paulo", "Livros"]
  ])("does not block benign retail wording: %s", (productName, category) => {
    expect(evaluateInstagramPolicy({
      productName,
      category,
      caption: "Confira a oferta disponível hoje"
    })).toEqual({ ok: true });
  });

  it("fails closed when policy context is empty", () => {
    const result = evaluateInstagramPolicy({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("INSTAGRAM_POLICY_INPUT_INVALID");
      expect(result.rule).toBe("missing_policy_context");
    }
  });

  it("detects risk terms present only in the caption", () => {
    const result = evaluateInstagramPolicy({
      productName: "Oferta especial",
      category: "Outros",
      caption: "Promoção de cigarro eletrônico e vape"
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.rule).toBe("drugs_tobacco_nicotine");
  });

  it("runs policy preflight before official approval on every Instagram publication", () => {
    const source = readFileSync("src/app/api/instagram/publish/route.ts", "utf8");
    const policyIndex = source.indexOf("const policy = evaluateInstagramPolicy");
    const approvalIndex = source.indexOf("const approval = await approveOfficialOfferForPublication");
    expect(policyIndex).toBeGreaterThan(-1);
    expect(approvalIndex).toBeGreaterThan(-1);
    expect(policyIndex).toBeLessThan(approvalIndex);
  });
});
