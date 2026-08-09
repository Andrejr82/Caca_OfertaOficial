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

  it("não duplica título no WhatsApp e deriva contexto Xbox somente do título", () => {
    const productName = "Controle Xbox 360 Sem Fio e Com Fio Preto Wireless Joystick Para Computador";
    const copy = buildCopyV3ChannelCopy({
      productName,
      marketplace: "Shopee",
      category: null,
      currentPrice: 59.98,
      originalPrice: 122.99,
      evidence: {}
    }, "whatsapp");

    expect(copy).not.toContain(productName + "\n\n🛍️");
    expect(copy.match(new RegExp(productName, "g")) ?? []).toHaveLength(0);
    expect(copy).toContain("sem fio/com fio");
    expect(copy).toContain("Sem fio ou com fio para usar no computador.");
    expect(copy).toContain("Para jogar no computador");
    expect(copy).toContain("R$ 59,98");
    expect(copy).toContain("51% OFF");
    expect(copy).not.toMatch(/Oferta em destaque|Boa opção para sua rotina|Seleção oficial do dia|Uma opção para sua rotina/iu);
  });

  it("mantém fallback curto sem repetir o título integral quando faltam evidências", () => {
    const productName = "Produto simples sem atributos";
    const copy = buildCopyV3ChannelCopy({
      productName,
      marketplace: "Shopee",
      category: null,
      currentPrice: 20,
      originalPrice: null,
      evidence: {}
    }, "whatsapp");

    expect(copy.match(new RegExp(productName, "g")) ?? []).toHaveLength(1);
    expect(copy).toContain("🛍️ Produto simples sem atributos");
    expect(copy).not.toMatch(/Oferta em destaque|Boa opção para sua rotina|Seleção oficial do dia|Uma opção para sua rotina/iu);
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

  it("corrige contexto incompatível e remove spec repetida no PC", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "PC Desktop Intel Core i3 8GB",
      marketplace: "Amazon",
      category: "Pet",
      currentPrice: 899,
      originalPrice: null,
      evidence: { attributes: ["8GB"] }
    }, "whatsapp", { hook: "💾 8GB" });

    expect(copy).not.toMatch(/pet|🐾/iu);
    expect(copy.match(/8GB/giu) ?? []).toHaveLength(1);
    expect(copy).toContain("Oferta na Amazon");
  });

  it("não duplica contexto de monitor gamer", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Monitor Gamer Samsung 24 polegadas",
      marketplace: "Amazon",
      category: "Informática",
      currentPrice: 799,
      originalPrice: null,
      evidence: {}
    }, "facebook");

    expect(copy.match(/Para jogar no computador/giu) ?? []).toHaveLength(1);
    expect(copy.match(/Oferta na Amazon/giu) ?? []).toHaveLength(1);
  });

  it("preserva contexto pet e cozinha quando a classificação é compatível", () => {
    const pet = buildCopyV3ChannelCopy({
      productName: "Ração Golden para gatos",
      marketplace: "Shopee",
      category: "Pet",
      currentPrice: 89,
      originalPrice: null,
      evidence: {}
    }, "whatsapp");
    const kitchen = buildCopyV3ChannelCopy({
      productName: "Air Fryer Mondial",
      marketplace: "Mercado Livre",
      category: "Cozinha",
      currentPrice: 299,
      originalPrice: null,
      evidence: {}
    }, "telegram");

    expect(pet).toContain("Para a rotina do pet");
    expect(kitchen).toContain("Para o preparo na cozinha");
    expect(kitchen).not.toMatch(/pet|🐾/iu);
  });

  it.each(["whatsapp", "telegram", "facebook", "instagram"] as const)("aplica slots semânticos uma vez em %s", (channel) => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Roteador TP-Link EX3000",
      marketplace: "Mercado Livre",
      category: "Pet",
      currentPrice: 199,
      originalPrice: 249,
      evidence: {}
    }, channel);

    expect(copy).not.toMatch(/pet|🐾/iu);
    expect(copy.match(/Oferta no Mercado Livre/giu) ?? []).toHaveLength(1);
  });

  it.each(["whatsapp", "telegram", "facebook", "instagram"] as const)("mantém marketplace puro em %s", (channel) => {
    const copy = buildCopyV3ChannelCopy({
      productName: "PC Desktop Intel Core i3 8GB",
      marketplace: "Amazon",
      category: "Pet",
      currentPrice: 899,
      originalPrice: null,
      evidence: { attributes: ["8GB"] },
    }, channel);

    expect(copy).toContain("Oferta na Amazon");
    expect(copy).not.toMatch(/🐾|Pet|CuidadosComPets/iu);
  });

  it.each(["whatsapp", "telegram", "facebook", "instagram"] as const)("não duplica o contexto do Olympikus Dynamic em %s", (channel) => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Tênis Olympikus Dynamic",
      marketplace: "Mercado Livre",
      category: "Moda",
      currentPrice: 199,
      originalPrice: null,
      evidence: {}
    }, channel);

    expect(copy.match(/Para compor o dia a dia/giu) ?? []).toHaveLength(1);
    expect(copy.match(/Oferta no Mercado Livre/giu) ?? []).toHaveLength(1);
  });

  it("omite benefício semanticamente igual ao hook", () => {
    const copy = buildCopyV3ChannelCopy({ ...coffeeMaker, productName: "Cafeteira Electrolux para o café", category: "Cozinha" }, "telegram", {
      hook: "Cafeteira Electrolux deixa o café simples",
      benefitLine: "Cafeteira Electrolux deixa o café simples",
      contextLine: "Para o preparo na cozinha",
    });

    expect(copy.match(/Cafeteira Electrolux deixa o café simples/giu) ?? []).toHaveLength(1);
  });
});
