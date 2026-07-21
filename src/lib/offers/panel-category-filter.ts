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
}

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
