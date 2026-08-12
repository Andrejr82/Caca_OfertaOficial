export type TrendCommercialMarketplace = "Shopee" | "Mercado Livre";

export interface TrendCommercialCandidateInput {
  marketplace: TrendCommercialMarketplace;
  nativeId: string;
  productName: string;
  normalizedTerm: string;
  permalink: string;
  imageUrl: string;
  currentPrice: number | string;
  oldPrice?: number | string | null;
  category?: string | null;
  observedAt: string;
  source: string;
  sourcePosition?: number | null;
  marketplaceMetrics?: Readonly<Record<string, unknown>> | null;
}

export interface TrendCommercialCandidate {
  marketplace: TrendCommercialMarketplace;
  nativeId: string;
  productName: string;
  normalizedTerm: string;
  permalink: string;
  imageUrl: string;
  currentPrice: number;
  oldPrice: number | null;
  category: string | null;
  observedAt: string;
  source: string;
  sourcePosition: number | null;
  marketplaceMetrics: Readonly<Record<string, unknown>>;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error("Candidatura inválida: " + field + " obrigatório.");
  return text;
}

function positivePrice(value: unknown): number {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Candidatura inválida: preço deve ser positivo.");
  return price;
}

function optionalPrice(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) throw new Error("Candidatura inválida: preço anterior inválido.");
  return price;
}

function httpsUrl(value: unknown, field: string): string {
  const url = requiredText(value, field);
  try {
    if (new URL(url).protocol !== "https:") throw new Error();
  } catch {
    throw new Error("Candidatura inválida: " + field + " deve ser uma URL HTTPS.");
  }
  return url;
}

function observedIso(value: unknown): string {
  const raw = requiredText(value, "data de observação");
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new Error("Candidatura inválida: data de observação inválida.");
  return date.toISOString();
}

export function normalizeTrendCommercialCandidate(
  input: TrendCommercialCandidateInput,
): TrendCommercialCandidate {
  if (input.marketplace !== "Shopee" && input.marketplace !== "Mercado Livre") {
    throw new Error("Candidatura inválida: marketplace fora do escopo.");
  }

  const nativeId = requiredText(input.nativeId, "identidade nativa");
  const productName = requiredText(input.productName, "título");
  const normalizedTerm = requiredText(input.normalizedTerm, "termo normalizado");
  const source = requiredText(input.source, "origem");
  const sourcePosition = input.sourcePosition == null ? null : Number(input.sourcePosition);
  if (sourcePosition !== null && (!Number.isInteger(sourcePosition) || sourcePosition < 1)) {
    throw new Error("Candidatura inválida: posição de origem inválida.");
  }

  return {
    marketplace: input.marketplace,
    nativeId,
    productName,
    normalizedTerm,
    permalink: httpsUrl(input.permalink, "permalink"),
    imageUrl: httpsUrl(input.imageUrl, "imagem"),
    currentPrice: positivePrice(input.currentPrice),
    oldPrice: optionalPrice(input.oldPrice),
    category: input.category == null ? null : String(input.category).trim() || null,
    observedAt: observedIso(input.observedAt),
    source,
    sourcePosition,
    marketplaceMetrics: Object.freeze({ ...(input.marketplaceMetrics ?? {}) }),
  };
}
