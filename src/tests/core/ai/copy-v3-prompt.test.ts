import { describe, expect, it } from "vitest";
import { buildConversionCopyContract, buildCopyV2ChannelCopy, buildCopyV3ChannelCopy, type CopyV2Facts, type CopyV3Facts } from "@/core/ai/prompt";
import { marketplaceLabel } from "@/core/ai/icon-catalog";

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
  it("cria contrato de conversão com identidade, oferta confiável, benefício comprovado e fala curta", () => {
    const contract = buildConversionCopyContract({
      ...coffeeMaker,
      shortName: "Cafeteira com jarra de vidro",
      currentPrice: 99.9,
      originalPrice: 129.9,
      evidence: { attributes: ["jarra de vidro"] }
    }, { benefitLine: "Jarra de vidro para acompanhar o preparo." });

    expect(contract.product).toBe("Cafeteira com jarra de vidro");
    expect(contract.hook).toContain("Cafeteira");
    expect(contract.benefit).toMatch(/jarra de vidro/iu);
    expect(contract.offer).toContain("R$ 99,90");
    expect(contract.offer).toContain("23% OFF");
    expect(contract.cta).toMatch(/Confira|Veja|Corre pra conferir/iu);
    expect(contract).not.toHaveProperty("shortSpeech");
    expect(contract.cta).toBe("Corre pra conferir.");
  });

  it("mantém preço e desconto somente no bloco comercial de uma oferta", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Kit Bolsa Transversal",
      shortName: "Kit Bolsa Transversal",
      marketplace: "Shopee",
      category: "Moda",
      currentPrice: 51.08,
      originalPrice: 78.9,
      evidence: {}
    }, "instagram");

    const hook = copy.split("\n\n")[0];
    expect(copy.match(/R\$ 51,08/g) ?? []).toHaveLength(1);
    expect(copy.match(/R\$ 78,90/g) ?? []).toHaveLength(1);
    expect(copy.match(/35%/g) ?? []).toHaveLength(1);
    expect(hook).not.toMatch(/R\$|%|desconto/iu);
  });

  it("mantém preço somente no bloco comercial quando não há desconto", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Conjunto Camiseta Básica",
      shortName: "Conjunto Camiseta Básica",
      marketplace: "Amazon",
      category: "Moda",
      currentPrice: 29.99,
      originalPrice: null,
      evidence: {}
    }, "whatsapp");

    const hook = copy.split("\n\n")[0];
    expect(copy.match(/R\$/g) ?? []).toHaveLength(1);
    expect(hook).not.toMatch(/R\$|%|desconto/iu);
  });

  it.each([
    ["Kit Bolsa Feminina", /kit.*bolsa feminina/iu],
    ["Conjunto Camiseta + Bermuda", /camiseta.*bermuda/iu],
    ["Moletom Flanelado com Zíper e Capuz", /flanelado.*zíper.*capuz/iu]
  ])("usa no gancho os fatos disponíveis em %s", (productName, expectedFact) => {
    const contract = buildConversionCopyContract({
      productName,
      shortName: productName,
      marketplace: "Shopee",
      category: "Moda",
      currentPrice: 0,
      originalPrice: null,
      evidence: {}
    });

    expect(contract.hook).toMatch(expectedFact);
    expect(contract.hook).not.toMatch(/conheça|em destaque|confira|se você procura/iu);
  });

  it("omite preço e benefício quando não há autoridade factual", () => {
    const contract = buildConversionCopyContract({
      productName: "Tênis Casual Masculino",
      shortName: "Tênis Casual Masculino",
      marketplace: "Shopee",
      category: "Moda",
      currentPrice: 0,
      originalPrice: null,
      evidence: {}
    }, { benefitLine: "Ideal para criar um look moderno." });

    expect(contract.offer).toBeNull();
    expect(contract.benefit).toBeNull();
    expect(contract).not.toHaveProperty("shortSpeech");
  });

  it.each(["instagram", "facebook", "whatsapp", "telegram"] as const)("renderiza uma estratégia própria para %s sem abertura de catálogo", (channel) => {
    const copy = buildCopyV3ChannelCopy({ ...coffeeMaker, shortName: "Cafeteira Electrolux" }, channel);

    expect(copy).toContain("Cafeteira Electrolux");
    expect(copy).not.toMatch(/^\s*Se você procura/iu);
    expect(copy).not.toContain("Acesse a publicação");
    expect(copy).toMatch(/Confira|Veja|Corre pra conferir/iu);
  });

  it("mantém variação entre canais sem perder fatos", () => {
    const instagram = buildCopyV3ChannelCopy(coffeeMaker, "instagram");
    const whatsapp = buildCopyV3ChannelCopy(coffeeMaker, "whatsapp");
    const telegram = buildCopyV3ChannelCopy(coffeeMaker, "telegram");
    const facebook = buildCopyV3ChannelCopy(coffeeMaker, "facebook");

    expect(new Set([instagram, whatsapp, telegram, facebook]).size).toBe(4);
    for (const copy of [instagram, whatsapp, telegram, facebook]) {
      expect(copy).toContain("Cafeteira Electrolux ECM10");
      expect(copy).toContain("R$ 114,63");
    }
  });

  it("rejeita a abertura fraca de tênis e preserva produto e CTA", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Tênis Casual Masculino",
      shortName: "Tênis Casual Masculino",
      marketplace: "Shopee",
      category: "Moda",
      currentPrice: 89.9,
      originalPrice: null,
      evidence: {}
    }, "whatsapp", { hook: "Se você procura um Tênis Casual Masculino, confira esta oferta" });

    expect(copy).not.toMatch(/^\s*Se você procura/iu);
    expect(copy).toContain("Tênis Casual Masculino");
    expect(copy).toMatch(/Confira|Veja|Corre pra conferir/iu);
    expect(copy).not.toMatch(/moderno|qualidade superior|ideal para/iu);
  });

  it.each([
    ["Amazon", "Calça Legging Suplex Goodbest Fitness Academia", "📦"],
    ["Shopee", "Cama para cachorro com almofada", "🛒"],
    ["Mercado Livre", "Notebook gamer 15 polegadas", "🟡"],
  ] as const)("usa somente o ícone da marketplace na linha de marketplace para %s", (marketplace, productName, icon) => {
    const facts = { ...coffeeMaker, marketplace, productName, category: "Produto", evidence: {} } satisfies CopyV3Facts;
    const copy = buildCopyV3ChannelCopy(facts, "whatsapp");
    const expectedLine = `${marketplaceLabel(marketplace).icon} ${marketplaceLabel(marketplace).text}`;
    expect(copy).toContain(expectedLine);
    expect(copy).not.toContain(`${icon === "📦" ? "👟 🏋️" : icon === "🛒" ? "🐾" : "💻"} ${marketplaceLabel(marketplace).text}`);
  });

  it.each(["whatsapp", "telegram", "facebook"] as const)("aplica a linha de marketplace da fonte oficial também no V2 em %s", (channel) => {
    const facts: CopyV2Facts = {
      marketplace: "Amazon", productName: "Calça Legging Suplex Fitness", category: "Moda",
      currentPrice: 79.9, originalPrice: 99.9, evidence: {}
    };
    const copy = buildCopyV2ChannelCopy(facts, channel);
    expect(copy).toContain(`${marketplaceLabel("Amazon").icon} ${marketplaceLabel("Amazon").text}`);
    expect(copy).not.toContain(`👟 🏋️ ${marketplaceLabel("Amazon").text}`);
  });

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
    expect(copy).not.toContain("Para jogar no computador");
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
    expect(copy).toContain("Produto simples sem atributos");
    expect(copy).not.toMatch(/Conheça|Em destaque|Confira|Se você procura/iu);
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
  ])("não inventa contexto de uso para %s", (productName, category, expectedContext) => {
    const copy = buildCopyV3ChannelCopy({ ...coffeeMaker, productName, category, evidence: {} }, "instagram");
    expect(copy).not.toContain(expectedContext);
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

    expect(copy.match(/Para jogar no computador/giu) ?? []).toHaveLength(0);
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

    expect(pet).not.toContain("Para a rotina do pet");
    expect(kitchen).not.toContain("Para o preparo na cozinha");
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

    expect(copy).not.toContain("Para compor o dia a dia");
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

  it("usa gancho factual sem fórmulas promocionais legadas", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Tênis Casual Masculino",
      shortName: "Tênis Casual Masculino",
      marketplace: "Shopee",
      category: "Moda",
      currentPrice: 89.9,
      originalPrice: null,
      evidence: {}
    }, "whatsapp");

    expect(copy).toContain("Tênis Casual Masculino");
    expect(copy).toContain("R$ 89,90");
    expect(copy).toContain("👉 Veja a oferta 👇");
    expect(copy).not.toMatch(/preço conferido|em destaque|Se você procura|Acesse a publicação/iu);
  });

  it("não publica benefício inferido quando a oferta não o comprova", () => {
    const copy = buildCopyV3ChannelCopy({
      productName: "Air Fryer Britânia",
      shortName: "Air Fryer Britânia",
      marketplace: "Shopee",
      category: "Cozinha",
      currentPrice: 299.9,
      originalPrice: null,
      evidence: {}
    }, "telegram");

    expect(copy).toContain("Air Fryer Britânia");
    expect(copy).toContain("R$ 299,90");
    expect(copy).not.toMatch(/preparo na cozinha|compor o dia a dia|ideal|perfeito/iu);
  });

  it("mantém uma única CTA sem shortSpeech especulativo", () => {
    const facts = {
      productName: "Organizador de Mesa", shortName: "Organizador de Mesa", marketplace: "Shopee",
      category: "Casa", currentPrice: 0, originalPrice: null, evidence: {}
    } satisfies CopyV3Facts;
    const contract = buildConversionCopyContract(facts);

    expect(contract.cta).toBe("Confira os detalhes no link.");
    expect(contract).not.toHaveProperty("shortSpeech");
    expect(buildCopyV3ChannelCopy(facts, "whatsapp")).toContain("👉 Veja a oferta 👇");
  });
});
