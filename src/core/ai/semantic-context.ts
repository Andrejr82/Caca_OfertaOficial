export type SemanticDomain = "gaming" | "technology" | "pet" | "kitchen" | "home" | "tools" | "fashion";

const PRODUCT_DOMAIN_RULES: Array<{ domain: SemanticDomain; pattern: RegExp }> = [
  { domain: "gaming", pattern: /controle|joystick|xbox|playstation|nintendo|game|gamer/iu },
  { domain: "technology", pattern: /notebook|computador|desktop|roteador|router|wifi|wi-fi|teclado|mouse|webcam|monitor|ssd|celular|smartphone|tablet|fone|headset/iu },
  { domain: "pet", pattern: /cachorro|gato|pet|ração|brinquedo animal/iu },
  { domain: "kitchen", pattern: /cafeteira|café|cozinha|panela|fritadeira|liquidificador|batedeira|airfryer/iu },
  { domain: "home", pattern: /geladeira|lavadora|lava e seca|micro-ondas|cooktop|forno|fogão|ar-condicionado|aspirador|tv|televis/iu },
  { domain: "tools", pattern: /ferramenta|furadeira|parafusadeira|chave|serra|oficina/iu },
  { domain: "fashion", pattern: /camiseta|vestido|tênis|sapato|bermuda|roupa|moda/iu },
];

const CATEGORY_DOMAIN_RULES: Array<{ domain: SemanticDomain; pattern: RegExp }> = [
  { domain: "pet", pattern: /pet|animal|cachorro|gato/iu },
  { domain: "kitchen", pattern: /cozinha|casa/iu },
  { domain: "technology", pattern: /informática|informatica|tecnologia|eletrônicos|eletronicos/iu },
  { domain: "tools", pattern: /ferramenta|construção|construcao/iu },
  { domain: "fashion", pattern: /moda|calçados|calcados/iu },
];

export function resolveSemanticDomain(productName: string, category: string | null | undefined): SemanticDomain | null {
  const productDomain = PRODUCT_DOMAIN_RULES.find((rule) => rule.pattern.test(String(productName || "")))?.domain;
  if (productDomain) return productDomain;
  return CATEGORY_DOMAIN_RULES.find((rule) => rule.pattern.test(String(category || "")))?.domain ?? null;
}

export function semanticDomainLabel(domain: SemanticDomain | null): string | null {
  return {
    gaming: "Games",
    technology: "Tecnologia",
    pet: "Pet",
    kitchen: "Cozinha",
    home: "Casa",
    tools: "Ferramentas",
    fashion: "Moda",
  }[domain ?? ""] ?? null;
}

export function semanticContextLine(domain: SemanticDomain | null): string | null {
  return {
    gaming: "🎮 Para jogar no computador",
    kitchen: "🍳 Para o preparo na cozinha",
    home: "🏠 Para a rotina da casa",
    technology: "📱 Para a rotina conectada",
    tools: "🛠️ Para reparos e projetos",
    pet: "🐾 Para a rotina do pet",
    fashion: "👕 Para compor o dia a dia",
  }[domain ?? ""] ?? null;
}
