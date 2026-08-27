import { evaluateCandidates } from "./common-evaluator";
import type { OfferQualityCandidateInput, OfferQualityMarketplace } from "./types";

type JsonRecord = Record<string, unknown>;

export interface OfferQualityQueueProduct extends JsonRecord {
  sourceItemId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  currentPrice?: number | string | null;
  originalPrice?: number | string | null;
  marketplaceMetrics?: Readonly<Record<string, unknown>> | null;
  discountEvidence?: Readonly<Record<string, unknown>> | null;
}

export interface QueueAdmissionOptions {
  marketplace: OfferQualityMarketplace;
  monetizationValid: (product: OfferQualityQueueProduct) => boolean;
  maxAccepted?: number;
  runId?: string;
  generatedAt?: string;
}

export interface QueueAdmissionRejection {
  product: OfferQualityQueueProduct;
  sourceItemId: string;
  reasons: readonly string[];
}

export interface QueueAdmissionResult {
  accepted: readonly OfferQualityQueueProduct[];
  rejected: readonly QueueAdmissionRejection[];
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

/**
 * Preço riscado extremamente distante do preço atual é tratado como evidência
 * comercial não confiável, não como motivo para descartar o produto inteiro.
 *
 * O limiar combina razão e economia absoluta para evitar punir liquidações
 * normais de itens baratos. Ex.: R$ 2.163,33 -> R$ 64,90 é neutralizado;
 * R$ 199,90 -> R$ 29,90 continua disponível para as demais validações.
 */
export function sanitizeQueueReferencePrice(
  product: OfferQualityQueueProduct,
): OfferQualityQueueProduct {
  const current = Number(product.currentPrice);
  const original = Number(product.originalPrice);
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(original) || original <= current) {
    return product;
  }

  const ratio = original / current;
  const savings = original - current;
  const implausibleReference = ratio >= 8 && savings >= 300;
  if (!implausibleReference) return product;

  return {
    ...product,
    originalPrice: null,
    discountEvidence: null,
    marketplaceMetrics: {
      ...(product.marketplaceMetrics ?? {}),
      referencePriceRejected: true,
      referencePriceReason: "implausible_reference_price",
      rejectedOriginalPrice: original,
      referencePriceRatio: Number(ratio.toFixed(2)),
    },
  };
}

function invalidInputReasons(product: OfferQualityQueueProduct): string[] {
  const reasons: string[] = [];
  if (!text(product.sourceItemId)) reasons.push("missing_native_identity");
  if (!text(product.title)) reasons.push("invalid_title");
  if (!text(product.sourceUrl).startsWith("https://")) reasons.push("invalid_source_url");
  if (!text(product.imageUrl).startsWith("https://")) reasons.push("invalid_image_url");
  const price = Number(product.currentPrice);
  if (!Number.isFinite(price) || price <= 0) reasons.push("invalid_price");
  return reasons;
}

function toCandidateInput(
  product: OfferQualityQueueProduct,
  options: QueueAdmissionOptions,
): OfferQualityCandidateInput {
  const identity = text(product.sourceItemId);
  return {
    marketplace: options.marketplace,
    nativeIdentity: identity,
    sourceItemId: identity,
    title: text(product.title),
    sourceUrl: text(product.sourceUrl),
    imageUrl: text(product.imageUrl),
    currentPrice: Number(product.currentPrice),
    originalPrice: product.originalPrice == null ? null : Number(product.originalPrice),
    marketplaceMetrics: product.marketplaceMetrics ?? {},
    discountEvidence: product.discountEvidence ?? null,
    prePersistMonetized: options.monetizationValid(product),
  };
}

export function selectOfferQualityQueueProducts(
  products: readonly OfferQualityQueueProduct[],
  options: QueueAdmissionOptions,
): QueueAdmissionResult {
  const rejected: QueueAdmissionRejection[] = [];
  const validProducts: OfferQualityQueueProduct[] = [];
  const candidates: OfferQualityCandidateInput[] = [];

  for (const rawProduct of products) {
    const product = sanitizeQueueReferencePrice(rawProduct);
    const sourceItemId = text(product.sourceItemId);
    const reasons = invalidInputReasons(product);
    if (!options.monetizationValid(product)) reasons.push("missing_monetization");
    if (reasons.length > 0) {
      rejected.push({ product, sourceItemId, reasons: [...new Set(reasons)] });
      continue;
    }
    validProducts.push(product);
    candidates.push(toCandidateInput(product, options));
  }

  const report = evaluateCandidates(candidates, {
    runId: options.runId ?? `queue-admission-${Date.now()}`,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  });
  const winnerDecisions = [...report.winners].sort((a, b) => {
    const scoreDiff = (b.score?.total ?? 0) - (a.score?.total ?? 0);
    return scoreDiff || a.candidate.sourceItemId.localeCompare(b.candidate.sourceItemId);
  });
  const limit = options.maxAccepted == null
    ? winnerDecisions.length
    : Math.max(0, Math.floor(Number(options.maxAccepted)));
  const winnerIds = new Set(winnerDecisions.slice(0, limit).map((decision) => decision.winnerSourceItemId));
  const allWinnerIds = new Set(winnerDecisions.map((decision) => decision.winnerSourceItemId));
  const decisionById = new Map(report.decisions.map((decision) => [decision.candidate.sourceItemId, decision]));
  const accepted = validProducts.filter((product) => winnerIds.has(text(product.sourceItemId)));

  for (const product of validProducts) {
    const sourceItemId = text(product.sourceItemId);
    if (winnerIds.has(sourceItemId)) continue;
    const decision = decisionById.get(sourceItemId);
    const reasons = allWinnerIds.has(sourceItemId)
      ? ["quality_rank_limit"]
      : (decision?.reasons?.length ? decision.reasons : ["not_selected_by_offer_quality_v2"]);
    rejected.push({ product, sourceItemId, reasons });
  }

  return Object.freeze({
    accepted: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
  });
}
