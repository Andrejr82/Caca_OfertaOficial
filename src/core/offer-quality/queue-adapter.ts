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

  for (const product of products) {
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
  const winnerIds = new Set(report.winners.map((decision) => decision.winnerSourceItemId));
  const decisionById = new Map(report.decisions.map((decision) => [decision.candidate.sourceItemId, decision]));
  const accepted = validProducts.filter((product) => winnerIds.has(text(product.sourceItemId)));

  for (const product of validProducts) {
    const sourceItemId = text(product.sourceItemId);
    if (winnerIds.has(sourceItemId)) continue;
    const decision = decisionById.get(sourceItemId);
    rejected.push({
      product,
      sourceItemId,
      reasons: decision?.reasons?.length ? decision.reasons : ["not_selected_by_offer_quality_v2"],
    });
  }

  return Object.freeze({
    accepted: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
  });
}
