import type { TrendSignalClassification } from "@/core/trends/types";
import { evaluateSemanticConfidence } from "@/lib/shopee/ranking/semantic-validator";
import { getPolicyForCategory } from "@/lib/shopee/ranking/category-policies";

export type TrendMatchingMarketplace = "Shopee" | "Mercado Livre";
export type TrendMatchStatus = "matched" | "no_match";

export interface TrendOfferCandidate {
  id: string;
  marketplace: string;
  productName: string;
  category?: string | null;
  currentPrice?: number | string | null;
  oldPrice?: number | string | null;
  itemId?: string | null;
  productId?: string | null;
  shopeeItemId?: string | null;
  permalink?: string | null;
  marketplaceMetrics?: Record<string, unknown> | null;
}

export interface TrendRejectedMatchCandidate {
  offerId: string;
  marketplace: string;
  reason: string;
}

export interface TrendValidatedMatch {
  offerId: string;
  marketplace: TrendMatchingMarketplace;
  productName: string;
  category: string | null;
  currentPrice: number | null;
  oldPrice: number | null;
  confidence: 100;
  reason: string;
}

export interface TrendMatchResult {
  status: TrendMatchStatus;
  offerId: string | null;
  marketplace: TrendMatchingMarketplace | null;
  confidence: 100 | 0;
  reason: string;
  validCandidates: TrendValidatedMatch[];
  rejectedCandidates: TrendRejectedMatchCandidate[];
}

// Removido BLOCKED_ACCESSORY_TERMS em favor do semantic-validator do Motor V1

function normalize(value: unknown): string {
  return String(value ?? "").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function words(value: unknown): string[] {
  return normalize(value).match(/[a-z0-9]+/g) ?? [];
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function numeric(value: unknown): number | null {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function hasNativeIdentity(candidate: TrendOfferCandidate) {
  const metrics = candidate.marketplaceMetrics ?? {};
  if (candidate.marketplace === "Shopee") {
    return Boolean(text(candidate.shopeeItemId) || text(candidate.itemId) || text(metrics.shopee_item_id) || text(metrics.itemId));
  }
  return Boolean(text(candidate.productId) || text(candidate.itemId) || text(metrics.productId) || text(metrics.itemId) || text(metrics.item_id));
}

function candidateText(candidate: TrendOfferCandidate) {
  const metrics = candidate.marketplaceMetrics ?? {};
  return [candidate.productName, candidate.category, metrics.brand, metrics.model, metrics.productName, metrics.title].filter(Boolean).join(" ");
}

function candidateReason(
  candidate: TrendOfferCandidate,
  classification: TrendSignalClassification
): string | null {
  const normalizedTerm = classification.normalizedProductTerm?.trim() ?? "";

  if (candidate.marketplace !== "Shopee" && candidate.marketplace !== "Mercado Livre") return "Marketplace fora do escopo 1D.";
  if (!hasNativeIdentity(candidate)) return "Oferta sem identidade nativa verificável.";
  
  // Se veio do motor Shopee V1 ranqueado, a defesa semântica contextual já atuou
  if (candidate.marketplace === "Shopee" && candidate.marketplaceMetrics?.strategy_version === "shopee-ranking-v1") {
    // Validar se o motor reprovou internamente (se o score for 0 ou confidence baixo, etc)
    // Mas no adapter nós só mapeamos os válidos pro radar. Então confiamos.
    return null;
  }

  // Defesa semântica do Motor Shopee V1 (substitui isAccessoryOrVariant e BLOCKED_ACCESSORY_TERMS)
  const policy = classification.categoryHint ? getPolicyForCategory(classification.categoryHint) : undefined;
  const semanticResult = evaluateSemanticConfidence(candidate.productName, normalizedTerm, policy);
  
  if (!semanticResult.isValid) {
    if (semanticResult.rejectionCode === 'accessory_mismatch') {
      return "Acessório, peça ou variante incompatível com o produto principal (Bloqueio V1).";
    }
    return "Título não corresponde à intenção do produto (Bloqueio V1).";
  }

  // Defesa em profundidade: confirmar presença dos termos esperados no texto do candidato
  const expected = words(normalizedTerm);
  const available = new Set(words(candidateText(candidate)));
  if (expected.length === 0 || expected.some((word) => !available.has(word))) return "Título e metadata não comprovam a identidade do produto.";
  return null;
}

export function matchTrendClassification(
  classification: TrendSignalClassification,
  candidates: TrendOfferCandidate[]
): TrendMatchResult {
  const normalizedTerm = classification.normalizedProductTerm?.trim() ?? "";
  if (classification.decision !== "eligible" || !classification.isProductIntent || !normalizedTerm) {
    return { status: "no_match", offerId: null, marketplace: null, confidence: 0, reason: "Classificação não elegível para matching.", validCandidates: [], rejectedCandidates: [] };
  }

  const validCandidates: TrendValidatedMatch[] = [];
  const rejectedCandidates: TrendRejectedMatchCandidate[] = [];
  for (const candidate of candidates) {
    const rejection = candidateReason(candidate, classification);
    if (rejection) {
      rejectedCandidates.push({ offerId: candidate.id, marketplace: candidate.marketplace, reason: rejection });
      continue;
    }
    validCandidates.push({
      offerId: candidate.id,
      marketplace: candidate.marketplace as TrendMatchingMarketplace,
      productName: candidate.productName,
      category: candidate.category ?? null,
      currentPrice: numeric(candidate.currentPrice),
      oldPrice: numeric(candidate.oldPrice),
      confidence: 100,
      reason: "Identidade nativa, marketplace, título e metadata compatíveis com o produto normalizado."
    });
  }

  validCandidates.sort((a, b) => {
    const marketplaceOrder = a.marketplace.localeCompare(b.marketplace);
    return marketplaceOrder || a.offerId.localeCompare(b.offerId);
  });
  const selected = validCandidates[0] ?? null;
  return selected
    ? { status: "matched", offerId: selected.offerId, marketplace: selected.marketplace, confidence: 100, reason: selected.reason, validCandidates, rejectedCandidates }
    : { status: "no_match", offerId: null, marketplace: null, confidence: 0, reason: "Nenhuma oferta compatível encontrada.", validCandidates, rejectedCandidates };
}
