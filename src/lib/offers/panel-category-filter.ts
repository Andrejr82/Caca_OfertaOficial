import { CATEGORY_TAXONOMY, normalizeCategory } from "@/lib/offers/category-taxonomy";

export const UNCLASSIFIED_PANEL_CATEGORY = "__unclassified__";

export interface PanelCategoryInput {
  product_name?: string | null;
  product?: string | null;
  category?: string | null;
  category_name?: string | null;
  subcategory?: string | null;
  source_categories?: unknown;
  marketplace?: string | null;
  platform?: string | null;
  source_position?: number | null;
  current_price?: number | null;
  old_price?: number | null;
  coupon?: string | null;
  rating?: number | null;
  commission_rate?: number | null;
  shipping_free?: boolean | null;
  score?: number | null;
  marketplace_metrics?: Record<string, unknown> | null;
}

export const PANEL_OFFER_TYPES = [
  "Alto desconto",
  "Baixo preço",
  "Com cupom",
  "Frete grátis",
  "Mais vendido",
  "Avaliação alta",
  "Oferta premium",
] as const;

export const PANEL_AUDIENCES = [
  "Tecnologia",
  "Casa e família",
  "Moda e beleza",
  "Esporte e lazer",
  "Pet",
  "Geral",
] as const;

export const PANEL_POSTING_PROFILES = [
  "Oferta agressiva",
  "Oferta de impulso",
  "Oferta premium",
  "Conteúdo visual",
  "Oferta geral",
] as const;

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function normalizeForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

const PANEL_RULES = [
  { category: "Crianças e Bebês", subcategory: "Roupas Infantis", keywords: ["macacão", "pijama de bebê", "roupa de bebê", "roupa infantil", "body bebê"] },
  { category: "Crianças e Bebês", subcategory: "Cadeirinha e carrinho", keywords: ["cadeirinha de carro", "bebê conforto", "assento infantil", "burigotto"] },
  { category: "Telefonia", subcategory: "iPhone", keywords: ["iphone"] },
  { category: "Telefonia", subcategory: "Samsung", keywords: ["samsung galaxy", "galaxy"] },
  { category: "Telefonia", subcategory: "Motorola", keywords: ["motorola", "moto g", "moto edge"] },
  { category: "Telefonia", subcategory: "Xiaomi", keywords: ["xiaomi", "redmi", "poco"] },
  { category: "Eletrônicos", subcategory: "Fones de ouvido", keywords: ["fone", "headphone", "headset", "earphone", "airpods"] },
  { category: "Eletrônicos", subcategory: "Smartwatch", keywords: ["smartwatch", "smart watch"] },
  { category: "Informática", subcategory: "Notebook", keywords: ["notebook", "laptop"] },
  { category: "Informática", subcategory: "Monitor", keywords: ["monitor"] },
  { category: "Informática", subcategory: "Tablet", keywords: ["tablet", "ipad"] },
  { category: "Eletroportáteis", subcategory: "Fritadeira Elétrica", keywords: ["air fryer", "airfryer", "fritadeira"] },
  { category: "Eletroportáteis", subcategory: "Liquidificador", keywords: ["liquidificador"] },
  { category: "Eletroportáteis", subcategory: "Cafeteira", keywords: ["cafeteira"] },
  { category: "Eletroportáteis", subcategory: "Aspirador de pó", keywords: ["aspirador"] },
  { category: "Televisão", subcategory: "TV Samsung", keywords: ["smart tv samsung", "tv samsung"] },
  { category: "Televisão", subcategory: "TV LG", keywords: ["smart tv lg", "tv lg"] },
  { category: "Moda, Beleza e Perfumaria", subcategory: "Perfume Feminino", keywords: ["perfume feminino"] },
  { category: "Moda, Beleza e Perfumaria", subcategory: "Perfume Masculino", keywords: ["perfume masculino"] },
  { category: "Esporte e Lazer", subcategory: "Suplementos Alimentares", keywords: ["whey", "creatina", "suplemento", "pre treino"] },
] as const;

/** Classificação temporária e exclusiva dos filtros do painel. */
export function classifyOfferForPanel(input: PanelCategoryInput) {
  const sourceText = [
    input.product_name,
    input.product,
    input.category,
    input.category_name,
    input.subcategory,
    input.marketplace,
    input.platform,
    ...collectStrings(input.source_categories),
  ].filter(Boolean).join(" | ");

  const productText = normalizeForMatch([input.product_name, input.product, input.subcategory].filter(Boolean).join(" | "));
  const panelRule = PANEL_RULES.find((rule) => rule.keywords.some((keyword) => productText.includes(normalizeForMatch(keyword))));
  if (panelRule) return { category: panelRule.category, subcategory: panelRule.subcategory };

  const productClassification = normalizeCategory(productText);
  if (productClassification.category !== "Geral") return productClassification;

  const directCategory = CATEGORY_TAXONOMY.find((node) =>
    [input.category, input.category_name].some((value) => normalizeForMatch(String(value || "")) === normalizeForMatch(node.name)),
  );
  if (directCategory) return { category: directCategory.name, subcategory: null };

  const result = normalizeCategory(sourceText);
  return {
    category: result.category === "Geral" ? UNCLASSIFIED_PANEL_CATEGORY : result.category,
    subcategory: result.subcategory,
  };
}

export function classifyPanelEditorial(input: PanelCategoryInput) {
  const category = classifyOfferForPanel(input);
  const metrics = input.marketplace_metrics || {};
  const currentPrice = Number(input.current_price || 0);
  const oldPrice = Number(input.old_price || 0);
  const discountFromPrice = oldPrice > currentPrice && currentPrice > 0
    ? ((oldPrice - currentPrice) / oldPrice) * 100
    : 0;
  const discount = Math.max(discountFromPrice, Number(metrics.discount || metrics.discountPercent || 0));
  const rating = Number(input.rating ?? metrics.rating ?? 0);
  const sales = Number(metrics.sales || 0);
  const sourcePosition = Number(input.source_position || metrics.sourcePosition || 0);
  const types: string[] = [];

  if (discount >= 30) types.push("Alto desconto");
  if (currentPrice > 0 && currentPrice <= 100) types.push("Baixo preço");
  if (String(input.coupon || "").trim()) types.push("Com cupom");
  if (input.shipping_free === true || metrics.shippingFree === true) types.push("Frete grátis");
  if (sales >= 100 || (sourcePosition > 0 && sourcePosition <= 20)) types.push("Mais vendido");
  if (rating >= 4.5) types.push("Avaliação alta");
  if (currentPrice >= 1000) types.push("Oferta premium");

  const audience = category.category === "Telefonia" || category.category === "Eletrônicos"
    || category.category === "Informática" || category.category === "Televisão" || category.category === "Games"
    ? "Tecnologia"
    : category.category === "Moda, Beleza e Perfumaria" ? "Moda e beleza"
    : category.category === "Esporte e Lazer" ? "Esporte e lazer"
    : category.category === "Petshop" ? "Pet"
    : ["Eletrodomésticos", "Eletroportáteis", "Ferramentas e Casa", "Móveis e Decoração", "Utilidades Domésticas", "Cama, Mesa e Banho"].includes(category.category)
      ? "Casa e família"
      : "Geral";

  const profiles: string[] = [];
  if (types.includes("Alto desconto") || types.includes("Com cupom")) profiles.push("Oferta agressiva");
  if (types.includes("Baixo preço")) profiles.push("Oferta de impulso");
  if (types.includes("Oferta premium")) profiles.push("Oferta premium");
  if (["Moda e beleza", "Casa e família"].includes(audience)) profiles.push("Conteúdo visual");
  if (profiles.length === 0) profiles.push("Oferta geral");

  return { ...category, types, audience, profiles };
}
