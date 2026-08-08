import { describe, expect, it } from "vitest";
import { buildCopyV3ChannelCopy, type CopyV3Facts } from "@/core/ai/prompt";

const coffeeMaker: CopyV3Facts = {
  productName: "Cafeteira Electrolux ECM10",
  marketplace: "Mercado Livre",
  category: "Eletroportáteis / Cozinha",
  currentPrice: 114.63,
  originalPrice: null,
  evidence: { attributes: ["jarra de vidro", "filtro permanente"], brand: "Electrolux" }
};

const channels = ["instagram", "facebook", "whatsapp", "telegram"] as const;

describe("Official AI Copy V3", () => {
  it("renderiza campos estruturados sustentados e fatos comerciais determinísticos", () => {
    const copy = buildCopyV3ChannelCopy(coffeeMaker, "instagram", {
      hook: "Seu café da manhã pode ficar bem mais prático",
      benefitLine: "A jarra de vidro e o filtro permanente ajudam no preparo do café.",
      contextLine: "Uma escolha prática para a rotina da cozinha."
    });

    expect(copy).toContain("Seu café da manhã pode ficar bem mais prático");
    expect(copy).toContain("jarra de vidro");
    expect(copy).toContain("R$ 114,63");
    expect(copy).toContain("Oferta no Mercado Livre");
    expect(copy).toContain("Link na bio ou nos Stories");
    expect(copy).toMatch(/#MercadoLivre/);
    expect(copy).not.toMatch(/https?:\/\//i);
  });

  it.each(channels)("mantém fatos e CTA próprios em %s", (channel) => {
    const copy = buildCopyV3ChannelCopy(coffeeMaker, channel, {
      hook: "Café mais simples na rotina",
      benefitLine: "Jarra de vidro e filtro permanente no preparo.",
      contextLine: "Para a cozinha do dia a dia."
    });

    expect(copy).toContain("Cafeteira Electrolux ECM10");
    expect(copy).toContain("R$ 114,63");
    expect(copy).not.toContain("Oferta em destaque");
    expect(copy).not.toContain("Uma opção para sua rotina");
    if (channel === "instagram") expect(copy).toContain("Link na bio ou nos Stories");
    if (channel === "facebook") expect(copy).toContain("primeiro comentário");
    if (channel === "whatsapp" || channel === "telegram") expect(copy).not.toMatch(/#MercadoLivre/);
  });

  it("recusa benefício sem evidência e usa fallback factual", () => {
    const copy = buildCopyV3ChannelCopy({
      ...coffeeMaker,
      productName: "Produto sem atributos",
      category: null,
      evidence: {}
    }, "instagram", {
      hook: "Produto incrível e potente",
      benefitLine: "Alta performance, resultado rápido e qualidade premium.",
      contextLine: "Ideal para transformar sua rotina."
    });

    expect(copy).toContain("Produto sem atributos");
    expect(copy).not.toMatch(/incrível|potente|alta performance|premium|ideal/iu);
    expect(copy).toContain("R$ 114,63");
  });

  it("não aceita atributo técnico ausente nos metadados", () => {
    const copy = buildCopyV3ChannelCopy({
      ...coffeeMaker,
      productName: "Ração para gatos",
      category: "Pet",
      evidence: {}
    }, "facebook", {
      hook: "Para a rotina do seu gato",
      benefitLine: "Ração com sabor frango para gatos.",
      contextLine: "Para a rotina do pet."
    });

    expect(copy).not.toContain("sabor frango");
    expect(copy).toContain("R$ 114,63");
  });

  it("usa a mesma fábrica para geração inicial e regeneração", () => {
    const initial = buildCopyV3ChannelCopy(coffeeMaker, "telegram", {
      hook: "Seu café da manhã pode ficar bem mais prático",
      benefitLine: "Jarra de vidro e filtro permanente no preparo.",
      contextLine: "Para a cozinha do dia a dia."
    });
    const regenerated = buildCopyV3ChannelCopy(coffeeMaker, "telegram", {
      hook: "Seu café da manhã pode ficar bem mais prático",
      benefitLine: "Jarra de vidro e filtro permanente no preparo.",
      contextLine: "Para a cozinha do dia a dia."
    });
    expect(regenerated).toBe(initial);
  });

  it.each([
    ["Geladeira Frost Free", "Eletrodomésticos", "rotina da casa"],
    ["Furadeira Bosch", "Ferramentas", "reparos e projetos"],
    ["Tênis Casual Nike", "Moda", "compor o dia a dia"],
    ["Ração para gatos", "Pet", "rotina do pet"],
    ["Celular Samsung Galaxy", "Tecnologia", "rotina conectada"]
  ])("deriva contexto coerente para %s", (productName, category, expectedContext) => {
    const copy = buildCopyV3ChannelCopy({ ...coffeeMaker, productName, category, evidence: {} }, "instagram");
    expect(copy).toContain(expectedContext);
    expect(copy).not.toContain("Automotivo");
  });
});
