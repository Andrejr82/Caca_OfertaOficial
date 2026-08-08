import type { CopyV2Facts } from "./prompt";

export type SocialHashtagChannel = "facebook" | "instagram";

const STOP_WORDS = new Set([
  "a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "para", "com", "sem", "em", "na", "no",
  "um", "uma", "kit", "novo", "nova", "original", "oficial", "modelo", "cor", "tamanho"
]);

const CATEGORY_RULES = [
  { pattern: /cozinha|panela|air\s*fryer|fritadeira|liquidificador|batedeira|pote|vidro|talher/iu, tags: ["Cozinha", "CozinhaPratica", "UtilidadesDomesticas"] },
  { pattern: /organiz|casa|sala|quarto|banheiro|decor/iu, tags: ["CasaOrganizada", "AchadinhosParaCasa"] },
  { pattern: /game|gamer|console|playstation|xbox|nintendo|controle/iu, tags: ["Games", "SetupGamer"] },
  { pattern: /pet|cachorro|cão|gato|ração|brinquedo animal/iu, tags: ["Pet", "CuidadosComPets"] },
  { pattern: /automotivo|carro|moto|pneu|veículo/iu, tags: ["Automotivo", "AcessoriosAutomotivos"] },
  { pattern: /beleza|skincare|maquiagem|perfume|cabelo|shampoo/iu, tags: ["Beleza", "Autocuidado"] },
  { pattern: /moda|camiseta|vestido|tênis|sapato|bermuda|roupa/iu, tags: ["Moda", "Estilo"] },
  { pattern: /celular|smartphone|notebook|tablet|fone|headset|teclado|mouse|monitor/iu, tags: ["Tecnologia", "AcessoriosTech"] },
] as const;

function normalizeWords(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .map((word) => word.toLocaleLowerCase("pt-BR"))
    .filter((word) => word && !STOP_WORDS.has(word));
}

function hashtag(value: string, preserveConnectors = false): string | null {
  const words = preserveConnectors
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(/\s+/u).filter(Boolean)
    : normalizeWords(value);
  if (words.length === 0) return null;
  const result = `#${words.map((word) => {
    const normalized = word.toLocaleLowerCase("pt-BR");
    return normalized.charAt(0).toLocaleUpperCase("pt-BR") + normalized.slice(1);
  }).join("")}`;
  return /^#[\p{L}\p{N}]+$/u.test(result) ? result : null;
}

function evidenceStrings(facts: CopyV2Facts): string[] {
  const evidence = facts.evidence ?? {};
  return Object.values(evidence).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
    return [];
  });
}

function marketplaceTags(marketplace: string): string[] {
  const normalized = marketplace.normalize("NFD").replace(/[\u0300-\u036f]/gu, "").toLocaleLowerCase("pt-BR");
  if (normalized.includes("shopee")) return ["Shopee", "Achadinhos Shopee", "Oferta Shopee"];
  if (normalized.includes("mercado livre") || normalized.includes("mercadolivre")) return ["Mercado Livre", "Achadinhos Mercado Livre", "Oferta Mercado Livre"];
  if (normalized.includes("amazon")) return ["Amazon", "Achadinhos Amazon", "Oferta Amazon"];
  return [marketplace, "Oferta"];
}

function productTags(facts: CopyV2Facts): string[] {
  const productWords = facts.productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/u)
    .map((word) => word.toLocaleLowerCase("pt-BR"))
    .filter((word) => word && !new Set(["um", "uma", "kit", "novo", "nova", "original", "oficial", "modelo", "cor", "tamanho"]).has(word));
  const evidence = evidenceStrings(facts);
  const brandValue = Object.entries(facts.evidence ?? {}).find(([key, value]) =>
    /brand|marca|manufacturer/i.test(key) && typeof value === "string" && value.trim()
  )?.[1];
  const brand = typeof brandValue === "string" ? brandValue : null;
  const explicitBrand = brand || [facts.productName, ...evidence].find((value) => /\b(?:Mondial|Philips|Samsung|Apple|Xiaomi|JBL|Electrolux|Wap|Nike|Adidas)\b/iu.test(value))?.match(/\b(?:Mondial|Philips|Samsung|Apple|Xiaomi|JBL|Electrolux|Wap|Nike|Adidas)\b/iu)?.[0];
  const brandWords = explicitBrand ? normalizeWords(explicitBrand) : [];
  const coreWords = productWords.filter((word) => !brandWords.includes(word)).slice(0, 3);
  return [hashtag(coreWords.join(" "), true), hashtag(explicitBrand || "", true)].filter((value): value is string => Boolean(value));
}

export function generateSocialHashtags(facts: CopyV2Facts, channel: SocialHashtagChannel): string[] {
  const sourceText = `${facts.productName} ${facts.category ?? ""}`;
  const categoryTags = CATEGORY_RULES.find((rule) => rule.pattern.test(sourceText))?.tags ?? [];
  const category = facts.category && !/^cat[:\s]/iu.test(facts.category) ? facts.category : "";
  const tags = [
    ...marketplaceTags(facts.marketplace),
    category,
    ...categoryTags,
    facts.originalPrice && facts.originalPrice > facts.currentPrice ? "Promoção" : "Oferta",
    ...(facts.evidence?.coupon ? ["Cupom"] : []),
  ];
  const deduplicated = new Map<string, string>();
  for (const value of [...productTags(facts), ...tags]) {
    const normalized = value.startsWith("#") ? value : hashtag(value);
    if (normalized) deduplicated.set(normalized.toLocaleLowerCase("pt-BR"), normalized);
  }
  const limit = channel === "facebook" ? 12 : 8;
  return [...deduplicated.values()].slice(0, limit);
}

export function renderSocialHashtags(facts: CopyV2Facts, channel: SocialHashtagChannel): string {
  return generateSocialHashtags(facts, channel).join(" ");
}
